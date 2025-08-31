import * as cheerio from 'cheerio';
import axios from 'axios';
import { promises as dns } from 'dns';

// Helper: Normalize phone numbers to E.164 (US-centric)
export function normalizePhone(phone) {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) digits = '1' + digits;
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    if (digits.startsWith('00')) return `+${digits.slice(2)}`;
    return '+' + digits;
}

// Enhanced email regex for better validation
const EMAIL_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

// Disposable email domains and placeholder domains to filter out
const DISPOSABLE_DOMAINS = [
    '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.org',
    'throwaway.email', 'yopmail.com', 'temp-mail.org', 'sharklasers.com',
    'getairmail.com', 'mailnesia.com', 'tempr.email', 'tmpmail.org',
    'maildrop.cc', 'spam4.me', 'fakeinbox.com', 'mailmetrash.com',
    'trashmail.com', 'mailnull.com', 'spamspot.com', 'spam.la',
    // Placeholder and template domains
    'example.com', 'example.org', 'test.com', 'demo.com', 'sample.com',
    'placeholder.com', 'domain.com', 'yourdomain.com', 'company.com',
    'mail.com', 'email.com', 'fakemail.com'
];

// Helper: Validate email format
function isValidEmailFormat(email) {
    return EMAIL_REGEX.test(email);
}

// Helper: Check if domain is disposable
function isDisposableDomain(domain) {
    return DISPOSABLE_DOMAINS.some(disposable => 
        domain.toLowerCase().includes(disposable.toLowerCase())
    );
}

// Helper: Check if email follows business patterns
function isBusinessEmailPattern(email) {
    const [local, domain] = email.toLowerCase().split('@');
    
    // NOTE: Do NOT exclude personal providers outright; our ICP often uses them.
    // We'll use them as a lower priority signal later, not a hard filter.
    
    // Business email patterns - more inclusive
    const businessPatterns = [
        /^[a-z]+\.[a-z]+@/, // first.last@company.com
        /^[a-z]+@[a-z]+\.(com|org|net|co|biz|io|ai|app)$/, // name@company.com
        /^[a-z]+@[a-z]+[a-z0-9]*\.(com|org|net|co|biz|io|ai|app)$/, // name@company123.com
        /^[a-z]+@[a-z]+\.(co|biz|io|ai|app)$/, // name@company.co
        /^[a-z]+@[a-z]+\.(com|org|net)$/, // name@company.com (simpler)
    ];
    
    // Also consider emails with business-like domains
    const businessDomains = [
        'company.com', 'business.com', 'corp.com', 'inc.com', 'llc.com',
        'enterprise.com', 'firm.com', 'group.com', 'team.com', 'studio.com',
        'clinic.com', 'salon.com', 'spa.com', 'gym.com', 'fitness.com',
        'restaurant.com', 'cafe.com', 'bar.com', 'pub.com', 'shop.com',
        'store.com', 'market.com', 'office.com', 'agency.com', 'consulting.com'
    ];
    
    const hasBusinessPattern = businessPatterns.some(pattern => pattern.test(email));
    const hasBusinessDomain = businessDomains.some(bd => domain.includes(bd));
    
    // Also check for common business domain patterns (but exclude personal providers)
    const hasBusinessDomainPattern = domain.match(/^(?!.*(gmail|yahoo|outlook|hotmail|aol|icloud|protonmail|zoho|yandex|mail\.ru|live|msn|me|mac)).*\.(com|org|net|co|biz|io|ai|app)$/);
    
    // Don't consider emails on personal providers as business patterns
    const personalProviders = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com', 'protonmail.com', 'zoho.com', 'yandex.com', 'mail.ru', 'live.com', 'msn.com', 'me.com', 'mac.com'];
    const isPersonalProvider = personalProviders.includes(domain);
    
    return !isPersonalProvider && (hasBusinessPattern || hasBusinessDomain || hasBusinessDomainPattern);
}

// Known aggregator/host domains frequently appearing in footers or widgets (de-prioritize)
const AGGREGATOR_DOMAINS = [
    'weomedia.com',
    'wixpress.com',
    'sentry-next.wixpress.com',
    'sentry.wixpress.com',
    'sentry.io',
    'wordpress.com',
    'godaddy.com',
    'mailchimp.com',
    'hubspot.com',
    'squareup.com',
    'weebly.com',
    'shopify.com',
    'squarespace.com',
    'google-analytics.com',
    'googletagmanager.com'
];

const PERSONAL_PROVIDERS = [
    'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 
    'icloud.com', 'protonmail.com', 'zoho.com', 'yandex.com', 'mail.ru',
    'live.com', 'msn.com', 'me.com', 'mac.com'
];

function looksLikePersonNameLocalPart(local) {
    // Enhanced person name patterns for business owners
    const personPatterns = [
        /^[a-z]{2,15}$/, // Single name: john, mike, sarah
        /^[a-z]{2,15}\.[a-z]{2,15}$/, // First.last: john.smith, sarah.johnson  
        /^[a-z]{2,15}[a-z]{2,15}$/, // Combined: johnsmith, sarahjohnson
        /^[a-z]\.[a-z]{2,15}$/, // Initial.last: j.smith, s.johnson
        /^[a-z]{2,15}\.[a-z]\.$/, // First.initial: john.s, sarah.j
        /^[a-z]{2,15}_[a-z]{2,15}$/, // Underscore: john_smith, sarah_johnson
        /^[a-z]{2,15}-[a-z]{2,15}$/, // Hyphen: john-smith, sarah-johnson
        /^[a-z]{2,15}[0-9]{1,3}$/, // Name with number: john123, mike1
    ];
    
    return personPatterns.some(pattern => pattern.test(local));
}

// Helper: DNS validation for domain (async)
async function validateDomainDNS(domain) {
    try {
        const mxRecords = await dns.resolveMx(domain);
        return mxRecords.length > 0;
    } catch {
        return false;
    }
}


// Helper: Extract emails from HTML with advanced methods
export function extractEmails(html) {
    const $ = cheerio.load(html);
    const emails = new Set();
    
    // Method 1: Extract from mailto links
    $('a[href^="mailto:"]').each((_, el) => {
        const email = $(el).attr('href').replace('mailto:', '').split('?')[0].split('&')[0];
        if (email) emails.add(email.toLowerCase());
    });
    
    // Method 2: Enhanced email regex patterns for obfuscated emails
    const emailPatterns = [
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Standard pattern
        /[a-zA-Z0-9._%+-]+\s*\[\s*at\s*\]\s*[a-zA-Z0-9.-]+\s*\[\s*dot\s*\]\s*[a-zA-Z]{2,}/gi, // [at] and [dot] obfuscation
        /[a-zA-Z0-9._%+-]+\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,}/g, // Spaced emails
    ];
    
    emailPatterns.forEach(pattern => {
        const matches = html.match(pattern) || [];
        matches.forEach(match => {
            // Clean up obfuscated emails
            const cleanEmail = match
                .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
                .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
                .replace(/\s+/g, '')
                .toLowerCase();
            if (cleanEmail.includes('@') && cleanEmail.includes('.')) {
                emails.add(cleanEmail);
            }
        });
    });
    
    // Method 3: Look for emails in JSON data (schema.org, contact forms)
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html());
            // Check for structured data emails
            if (data.email) emails.add(data.email.toLowerCase());
            if (data.contactPoint && data.contactPoint.email) emails.add(data.contactPoint.email.toLowerCase());
            if (data.author && data.author.email) emails.add(data.author.email.toLowerCase());
        } catch {}
    });
    
    // Method 4: Extract from data attributes and hidden content
    $('[data-email], [data-contact], [data-mail]').each((_, el) => {
        const dataEmail = $(el).attr('data-email') || $(el).attr('data-contact') || $(el).attr('data-mail');
        if (dataEmail && dataEmail.includes('@')) {
            emails.add(dataEmail.toLowerCase());
        }
    });
    
    // Method 5: Look for encoded emails (base64, URL encoded)
    const base64Pattern = /[A-Za-z0-9+/]{20,}={0,2}/g;
    const base64Matches = html.match(base64Pattern) || [];
    base64Matches.forEach(match => {
        try {
            const decoded = Buffer.from(match, 'base64').toString();
            if (decoded.includes('@') && decoded.includes('.')) {
                const emailMatch = decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch) emails.add(emailMatch[0].toLowerCase());
            }
        } catch {}
    });
    
    return Array.from(emails).slice(0, 8); // Increased limit for better coverage
}

// Helper: Dedupe by placeId
export function dedupePlaces(arr) {
    const map = new Map();
    for (const obj of arr) {
        if (!map.has(obj.placeId)) map.set(obj.placeId, obj);
    }
    return Array.from(map.values());
}

// Enhanced business email filtering with balanced approach
export async function filterBusinessEmails(emailList, options = {}) {
    const { websiteDomain = null } = options;
    if (!emailList || !Array.isArray(emailList)) return [];
    
    const validEmails = [];
    
    for (const email of emailList) {
        // Handle social media contacts (non-email format)
        if (email.startsWith('instagram:') || email.startsWith('facebook:') || email.startsWith('twitter:')) {
            validEmails.push({ email, score: 30 }); // Medium priority for social contacts
            continue;
        }
        
        const [local, domain] = email.toLowerCase().split('@');
        
        // Basic validation
        if (!local || !domain || !isValidEmailFormat(email)) continue;
        
        // Skip disposable domains
        if (isDisposableDomain(domain)) continue;
        
        // Skip file extensions
        if (email.match(/\.(png|jpg|jpeg|gif|svg|webp|bmp|tiff|pdf|doc|docx)$/i)) continue;
        
        // Skip hash-like local parts (24+ hex chars) and random strings - Enhanced for Sentry/Wix
        if (/^[a-f0-9]{24,}$/i.test(local)) continue;
        if (/^[a-f0-9]{32}$/i.test(local)) continue; // Common hash length
        
        // Skip obviously generated emails (long random strings)
        if (local.length > 15 && /^[a-z0-9]{15,}$/i.test(local)) continue;
        
        // Skip emails with excessive numbers
        if ((local.match(/\d/g) || []).length > local.length * 0.5) continue;
        
        // Skip Sentry/tracking emails specifically
        if (domain.includes('sentry') || local.includes('sentry')) continue;
        
        // Enhanced placeholder detection
        const placeholders = [
            'your@email.com', 'user@domain.com', 'hi@mystore.com', 'test@domain.com',
            'demo@domain.com', 'sample@domain.com', 'email@example.com', 'contact@domain.com',
            'mail@domain.com', 'admin@domain.com', 'info@domain.com', 'example@domain.com',
            'test@test.com', 'admin@admin.com', 'user@user.com', 'contact@contact.com'
        ];
        if (placeholders.includes(email.toLowerCase())) continue;
        
        // Detect obvious placeholder/filler emails
        const fillerPrefixes = ['filler', 'placeholder', 'temp', 'temporary', 'fake', 'dummy', 'sample'];
        if (fillerPrefixes.some(prefix => local.startsWith(prefix))) continue;
        
        // Detect hosting/development related emails (often unrelated to actual business)
        const devDomains = ['godaddy.com', 'hostgator.com', 'bluehost.com', 'lab6.com', 'dev.com', 'localhost'];
        if (devDomains.some(devDomain => domain.includes(devDomain))) continue;
        
        // Skip emails that look like placeholders (repeated words)
        if (local === domain.split('.')[0]) continue;
        
        // Strict DNS validation for better email quality
        const hasValidDNS = await validateDomainDNS(domain);
        if (!hasValidDNS) {
            continue; // Skip emails with invalid DNS
        }
        
        // Simple 3-tier scoring system
        let score = 0;
        const isBusinessPattern = isBusinessEmailPattern(email);
        const isPersonName = looksLikePersonNameLocalPart(local);
        
        // Tier 1: Business emails (highest priority)
        if (isBusinessPattern) {
            score = 100;
            if (websiteDomain && domain.endsWith(websiteDomain)) score += 10; // Same domain bonus
        }
        // Tier 2: Person names on personal providers  
        else if (PERSONAL_PROVIDERS.includes(domain) && isPersonName) {
            score = 50;
        }
        // Tier 3: Other valid emails
        else {
            score = 10;
        }

        // Skip excluded prefixes
        const excludedPrefixes = [
            'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'bounce', 'mailer-daemon',
            'postmaster', 'abuse', 'spam', 'webmaster', 'root', 'sysadmin', 'system',
            'daemon', 'nobody', 'www-data', 'apache', 'nginx', 'ftp', 'mail', 'alerts',
            'notifications', 'automated', 'robot', 'bot', 'crawler', 'spider'
        ];
        if (excludedPrefixes.includes(local)) continue;

        // Penalize aggregator/host platforms
        if (AGGREGATOR_DOMAINS.some(d => domain.endsWith(d))) score -= 50;

        validEmails.push({ email, score });
    }
    
    // Sort by score descending and return top 6 contacts (emails + social)
    return validEmails
        .sort((a, b) => b.score - a.score)
        .map(item => item.email)
        .slice(0, 6);
}

// Places API (New) v1 endpoints
const PLACE_DETAILS_V1_URL = 'https://places.googleapis.com/v1/places';

// Enrich place with website, phone, and emails
export async function enrichPlaceDetails(place, apiKey, rateLimiter = null) {
    try {
        // Apply rate limiting if provided
        if (rateLimiter) {
            await rateLimiter.checkLimits();
        }
        // Skip Place Details API call if we already have website (saves API costs)
        // Only call if both website and phone are missing
        if (!place.website && !place.phone) {
            const detailsUrl = `${PLACE_DETAILS_V1_URL}/${encodeURIComponent(place.placeId)}`;
            const detailsResp = await axios.get(detailsUrl, {
                headers: {
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask': 'websiteUri,internationalPhoneNumber',
                },
                timeout: 10000,
            });
            const details = detailsResp.data || {};
            const legacyResult = details.result || {};
            const websiteFromApi = details.websiteUri || legacyResult.website || legacyResult.websiteUri || '';
            const phoneFromApi = details.internationalPhoneNumber || legacyResult.international_phone_number || legacyResult.internationalPhoneNumber || '';
            place.website = place.website || websiteFromApi || '';
            place.phone = place.phone || normalizePhone(phoneFromApi || '');
        }
        if (place.website) {
            try {
                const htmlResp = await axios.get(place.website, { timeout: 15000 });
                const homepageHtml = htmlResp.data;
                const rawEmails = extractEmails(homepageHtml);

                // Enhanced homepage email extraction with multiple methods
                const $ = cheerio.load(homepageHtml);
                
                // Method 1: Check for embedded emails in homepage text content
                const pageText = $.text();
                const emailsInText = pageText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                rawEmails.push(...emailsInText);
                
                // Method 2: Look for emails in specific HTML elements and attributes
                const emailPatterns = [
                    /mailto:([^"'\s>]+)/gi,
                    /email[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
                    /contact[:\s]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi
                ];
                
                emailPatterns.forEach(pattern => {
                    const matches = homepageHtml.match(pattern) || [];
                    matches.forEach(match => {
                        const emailMatch = match.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        if (emailMatch) rawEmails.push(emailMatch[0]);
                    });
                });
                
                // Method 3: Check common footer and contact sections
                const contactSelectors = [
                    'footer', '.footer', '#footer',
                    '.contact', '#contact', '.contact-info',
                    '.about', '#about', '.about-us'
                ];
                
                contactSelectors.forEach(selector => {
                    try {
                        const sectionText = $(selector).text();
                        const sectionEmails = sectionText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                        rawEmails.push(...sectionEmails);
                    } catch {}
                });

                // Extract social media handles as contact method
                const socialContacts = new Set();
                const socialLinks = [];
                $('a[href*="instagram"], a[href*="facebook"], a[href*="twitter"]').each((_, el) => {
                    const href = $(el).attr('href');
                    if (href) socialLinks.push(href);
                });
                
                // Extract Instagram handles (can be contacted via DM)
                socialLinks.forEach(link => {
                    const instagramMatch = link.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
                    if (instagramMatch && !instagramMatch[1].includes('p/') && !instagramMatch[1].includes('explore')) {
                        socialContacts.add(`instagram:${instagramMatch[1]}`);
                    }
                    
                    const facebookMatch = link.match(/facebook\.com\/([a-zA-Z0-9_.]+)/);
                    if (facebookMatch && !facebookMatch[1].includes('p/')) {
                        socialContacts.add(`facebook:${facebookMatch[1]}`);
                    }
                });
                
                // Only scrape ONE additional page if no emails found yet
                const moreEmails = [];
                if (rawEmails.length === 0) {
                    const contactKeywords = ['contact', 'about'];
                    const candidateUrls = new Set();
                    
                    $('a[href]').each((_, el) => {
                        const href = ($(el).attr('href') || '').trim();
                        if (!href) return;
                        const text = ($(el).text() || '').toLowerCase();
                        const hrefLower = href.toLowerCase();
                        if (contactKeywords.some(k => hrefLower.includes(k) || text.includes(k))) {
                            try {
                                const base = new URL(place.website);
                                const abs = new URL(href, base).toString();
                                if (new URL(abs).hostname === new URL(place.website).hostname) {
                                    candidateUrls.add(abs);
                                }
                            } catch {}
                        }
                    });
                    
                    // Only fetch the first contact/about page
                    if (candidateUrls.size > 0) {
                        const firstUrl = Array.from(candidateUrls)[0];
                        try {
                            const pageResp = await axios.get(firstUrl, { timeout: 6000 });
                            moreEmails.push(...extractEmails(pageResp.data));
                        } catch {}
                    }
                }
                
                // Always add social contacts as additional contact methods
                const allRaw = Array.from(new Set([...rawEmails, ...moreEmails, ...Array.from(socialContacts)]));
                // Derive base domain from website for scoring
                let websiteDomain = null;
                try {
                    const { hostname } = new URL(place.website);
                    websiteDomain = hostname.replace(/^www\./, '');
                } catch {
                    websiteDomain = null;
                }
                place.emailList = await filterBusinessEmails(allRaw, { websiteDomain });
            } catch {
                place.emailList = [];
            }
        } else {
            place.emailList = [];
        }
    } catch {
        place.website = '';
        place.phone = '';
        place.emailList = [];
    }
    return place;
} 
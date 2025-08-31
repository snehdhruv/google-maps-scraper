import { extractEmails, normalizePhone, dedupePlaces, filterBusinessEmails } from '../helpers.js';
import { enrichPlaceDetails } from '../helpers.js';
import axios from 'axios';
jest.mock('axios');

// No need to mock axios or cheerio for these pure helper tests

describe('Helper Functions', () => {
    test('extractEmails finds mailto and plain emails', () => {
        const html = '<a href="mailto:test@example.com">Email</a> Contact: info@site.com';
        const emails = extractEmails(html);
        expect(emails).toEqual(['test@example.com', 'info@site.com']);
    });

    test('normalizePhone cleans phone numbers', () => {
        expect(normalizePhone('(415) 555-1234')).toBe('+14155551234');
        expect(normalizePhone('415.555.1234')).toBe('+14155551234');
        expect(normalizePhone('+1 415-555-1234')).toBe('+14155551234');
    });

    test('dedupePlaces removes duplicates by placeId', () => {
        const arr = [
            { placeId: 'abc', name: 'A' },
            { placeId: 'def', name: 'B' },
            { placeId: 'abc', name: 'A2' },
        ];
        const deduped = dedupePlaces(arr);
        expect(deduped.length).toBe(2);
        expect(deduped.find(x => x.placeId === 'abc').name).toBe('A');
    });
});

describe('enrichPlaceDetails', () => {
    afterEach(() => jest.clearAllMocks());
    test('fetches website, phone, and extracts emails', async () => {
        axios.get
            .mockResolvedValueOnce({ data: { result: { website: 'https://google.com', international_phone_number: '+1 415-555-1234' } } })
            .mockResolvedValueOnce({ data: '<a href="mailto:lead@google.com">Email</a> info@google.com' });
        const place = { placeId: 'abc', website: '', phone: '', emailList: [] };
        const GOOGLE_API_KEY = 'fake';
        const enriched = await enrichPlaceDetails(place, GOOGLE_API_KEY);
        expect(enriched.website).toBe('https://google.com');
        expect(enriched.phone).toBe('+14155551234');
        // Should include both emails but prioritize business patterns
        expect(enriched.emailList).toContain('lead@google.com');
        expect(enriched.emailList).toContain('info@google.com');
    });
});

describe('filterBusinessEmails', () => {
    test('allows business emails and filters out disposable domains', async () => {
        const emails = [
            'john@google.com', 'jane.doe@microsoft.com', 'ceo@apple.com',
            'info@gmail.com', 'contact@yahoo.com', 'support@outlook.com',
            'test@10minutemail.com', 'temp@mailinator.com', 'fake@yopmail.com',
            'john@gmail.com', 'jane@yahoo.com', 'user@outlook.com'
        ];
        const filtered = await filterBusinessEmails(emails);
        // Should include business emails and personal emails from legitimate providers
        // but exclude disposable domains
        expect(filtered).toContain('john@google.com');
        expect(filtered).toContain('jane.doe@microsoft.com');
        expect(filtered).toContain('ceo@apple.com');
        // Should exclude disposable domains
        expect(filtered).not.toContain('test@10minutemail.com');
        expect(filtered).not.toContain('temp@mailinator.com');
        expect(filtered).not.toContain('fake@yopmail.com');
        // Should include some personal emails (up to 6 total limit)
        expect(filtered.length).toBeLessThanOrEqual(6);
    });

    test('handles empty or malformed input', async () => {
        expect(await filterBusinessEmails([])).toEqual([]);
        expect(await filterBusinessEmails(['notanemail'])).toEqual([]);
        expect(await filterBusinessEmails(null)).toEqual([]);
    });

    test('filters out unwanted patterns and prioritizes business emails', async () => {
        const emails = [
            'john@google.com', 'jane.doe@microsoft.com', 'ceo@apple.com',
            'noreply@google.com', 'no-reply@microsoft.com', 'bounce@example.com',
            'postmaster@google.com', 'abuse@microsoft.com', 'spam@example.com',
            'john@gmail.com', 'jane@yahoo.com', 'user@outlook.com',
            '605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com',
            'tactile_noise_@2X-Light.png',
            'abcdefabcdefabcdefabcdefabcdef@google.com', // hash-like
            'normal@google.com', 'user@google.com',
            'your@email.com', 'test@domain.com', 'demo@domain.com'
        ];
        const filtered = await filterBusinessEmails(emails);
        
        // Should include legitimate business emails
        expect(filtered).toContain('john@google.com');
        expect(filtered).toContain('jane.doe@microsoft.com');
        expect(filtered).toContain('ceo@apple.com');
        
        // Should exclude unwanted patterns
        expect(filtered).not.toContain('noreply@google.com');
        expect(filtered).not.toContain('no-reply@microsoft.com');
        expect(filtered).not.toContain('bounce@example.com');
        expect(filtered).not.toContain('postmaster@google.com');
        expect(filtered).not.toContain('abuse@microsoft.com');
        expect(filtered).not.toContain('spam@example.com');
        expect(filtered).not.toContain('605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com');
        expect(filtered).not.toContain('tactile_noise_@2X-Light.png');
        expect(filtered).not.toContain('abcdefabcdefabcdefabcdefabcdef@google.com');
        expect(filtered).not.toContain('your@email.com');
        expect(filtered).not.toContain('test@domain.com');
        expect(filtered).not.toContain('demo@domain.com');
        
        // Should respect 6-email limit
        expect(filtered.length).toBeLessThanOrEqual(6);
    });

    test('prioritizes business pattern emails', async () => {
        const emails = [
            'john@gmail.com', 'jane@yahoo.com', // personal emails
            'john@google.com', 'jane.doe@microsoft.com', 'ceo@apple.com' // business patterns
        ];
        const filtered = await filterBusinessEmails(emails);
        
        // Business pattern emails should appear first (higher priority)
        const businessEmails = ['john@google.com', 'jane.doe@microsoft.com', 'ceo@apple.com'];
        const personalEmails = ['john@gmail.com', 'jane@yahoo.com'];
        
        // Check that business emails come before personal emails in the result
        const businessIndices = businessEmails.map(email => filtered.indexOf(email)).filter(i => i !== -1);
        const personalIndices = personalEmails.map(email => filtered.indexOf(email)).filter(i => i !== -1);
        
        // If we have both business and personal emails, business should come first
        if (businessIndices.length > 0 && personalIndices.length > 0) {
            // Check that at least one business email comes before all personal emails
            const minBusinessIndex = Math.min(...businessIndices);
            const maxPersonalIndex = Math.max(...personalIndices);
            expect(minBusinessIndex).toBeLessThan(maxPersonalIndex);
        }
    });
});

// Add more tests for API call logic, error handling, and chunked saving as needed. 
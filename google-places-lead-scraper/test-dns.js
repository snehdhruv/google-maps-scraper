import { promises as dns } from 'dns';

async function validateDomainDNS(domain) {
    try {
        const mxRecords = await dns.resolveMx(domain);
        return mxRecords.length > 0;
    } catch {
        return false;
    }
}

// Test valid domains
const testCases = [
    'gmail.com',           // Should have MX records
    'yahoo.com',           // Should have MX records
    'bigcitywings.com',    // Real business domain
    'invaliddomainxyz123.com', // Should fail
    'example.com',         // Example domain - may or may not have MX
];

console.log('Testing DNS/MX validation...\n');

for (const domain of testCases) {
    const start = Date.now();
    const hasValidDNS = await validateDomainDNS(domain);
    const time = Date.now() - start;
    console.log(`${domain}: ${hasValidDNS ? '✅ Valid' : '❌ Invalid'} (${time}ms)`);
}

// Test actual business emails from the dataset
const businessEmails = [
    'info@elitemedicalclinic.net',
    'eben@eyebytes.com',
    'dpssrep@dpss.lacounty.gov',
    'info@losangelesprimarycare.com',
    'newpatient@socalmedical.com',
    'fortgreene@brooklynpublic.com',
    'info@eightrowflint.com'
];

console.log('\nTesting actual business emails:');
for (const email of businessEmails) {
    const domain = email.split('@')[1];
    const start = Date.now();
    const hasValidDNS = await validateDomainDNS(domain);
    const time = Date.now() - start;
    console.log(`${email}: ${hasValidDNS ? '✅ Valid' : '❌ Invalid'} (${time}ms)`);
}
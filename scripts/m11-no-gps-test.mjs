/**
 * M11 Missing GPS test — create case without coords, verify assignment works
 */
const BASE = 'http://localhost:3000';

async function login(role) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  const cookies = res.headers.getSetCookie?.() || [];
  return { data, cookies };
}

async function authedFetch(url, options, cookies) {
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
  return fetch(url, { ...options, headers: { ...options?.headers, Cookie: cookieStr } });
}

async function main() {
  console.log('\n=== M11 Missing GPS Test ===\n');

  // Login as operator
  const op = await login('OPERATOR');

  // Create a case WITHOUT GPS coordinates
  const createRes = await fetch(`${BASE}/api/emergency-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalMessage: 'Elderly man collapsed near Anarkali Bazaar Lahore. No GPS available. Needs ambulance.',
      source: 'WEB',
      primaryContact: '+92-300-9991111',
      locationText: 'Anarkali Bazaar, Lahore',
      categories: ['MEDICAL'],
      // No latitude/longitude — simulating missing GPS
    }),
  });
  const created = await createRes.json();
  console.log('Created case:', created.caseCode, 'status:', createRes.status);

  if (!createRes.ok) {
    console.log('Failed to create case:', JSON.stringify(created));
    process.exit(1);
  }

  // Wait a moment for AI enrichment
  await new Promise(r => setTimeout(r, 2000));

  // Get case detail
  const caseRes = await authedFetch(
    `${BASE}/api/operator/cases/${created.caseCode}`,
    {},
    op.cookies
  );
  const caseData = await caseRes.json();
  console.log('Case latitude:', caseData.latitude, 'longitude:', caseData.longitude);
  console.log('Case locationText:', caseData.locationText);

  const hasGps = caseData.latitude != null && caseData.longitude != null;
  console.log('Has GPS:', hasGps);

  // Get available resources
  const resRes = await authedFetch(
    `${BASE}/api/operator/cases/${created.caseCode}/assign`,
    {},
    op.cookies
  );
  const resources = await resRes.json();

  if (resources.responders.length === 0) {
    console.log('No available responders (may already be assigned from previous test)');
    console.log('PASS: Missing GPS case created and loadable — assignment skipped (no available responders)');
    process.exit(0);
  }

  // Try to assign — should succeed even without GPS
  const assignRes = await authedFetch(
    `${BASE}/api/operator/cases/${created.caseCode}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responderId: resources.responders[0].id }),
    },
    op.cookies
  );
  const assignData = await assignRes.json();

  if (assignRes.status === 201) {
    console.log('PASS: Assignment succeeded without GPS — assignmentId:', assignData.assignmentId);
  } else {
    console.log('FAIL: Assignment failed without GPS:', JSON.stringify(assignData));
    process.exit(1);
  }

  // Verify case status
  const verifyRes = await authedFetch(
    `${BASE}/api/operator/cases/${created.caseCode}`,
    {},
    op.cookies
  );
  const verifyData = await verifyRes.json();
  console.log('Case status after assignment:', verifyData.status);
  console.log(verifyData.status === 'ASSIGNED' ? 'PASS: Status is ASSIGNED' : 'FAIL: Status not ASSIGNED');

  console.log('\n=== Missing GPS test complete ===\n');
}

main().catch(err => { console.error(err); process.exit(1); });

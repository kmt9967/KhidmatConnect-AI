/**
 * M11 API integration tests — runs against localhost:3000
 */
const BASE = 'http://localhost:3000';

async function login(role) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
    redirect: 'manual',
  });
  const data = await res.json();
  const cookies = res.headers.getSetCookie?.() || [];
  return { data, cookies, ok: res.ok, status: res.status };
}

async function authedFetch(url, options, cookies) {
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');
  return fetch(url, {
    ...options,
    headers: { ...options?.headers, Cookie: cookieStr },
  });
}

let passed = 0;
let failed = 0;

function assert(name, condition, detail) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name} — ${detail || ''}`);
    failed++;
  }
}

async function main() {
  console.log('\n=== M11 API Tests ===\n');

  // 1. Login as OPERATOR
  console.log('1. Operator login');
  const opLogin = await login('OPERATOR');
  assert('Operator login returns 200', opLogin.ok, `status=${opLogin.status}`);
  assert('Operator session cookie set', opLogin.cookies.length > 0, 'no cookies');

  // 2. Create a dedicated NEW test case (self-contained; demo queue stays curated),
  //    then GET its detail as OPERATOR
  console.log('\n2. Create test case + GET case detail as OPERATOR');
  let caseCode;
  {
    const createRes = await fetch(`${BASE}/api/emergency-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'WEB',
        primaryContact: '0300-8241099',
        originalMessage: 'M11 test case — person trapped after wall collapse at Jamshed Town, needs rescue.',
        latitude: 24.8915,
        longitude: 67.0177,
        locationText: 'Jamshed Town, Karachi',
        categories: ['RESCUE'],
      }),
    });
    assert('Test case created (201)', createRes.status === 201, `status=${createRes.status}`);
    caseCode = (await createRes.json()).caseCode;
    assert('Created case has a caseCode', !!caseCode, String(caseCode));
  }
  const caseRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}`,
    {},
    opLogin.cookies
  );
  const caseData = await caseRes.json();
  assert('Case detail returns 200', caseRes.status === 200, `status=${caseRes.status}`);
  assert('Case has caseCode', caseData.caseCode === caseCode, caseData.caseCode);
  assert('Case has status', !!caseData.status, caseData.status);
  assert('Case has categories', Array.isArray(caseData.categories), typeof caseData.categories);
  assert('Case has updates (timeline)', Array.isArray(caseData.updates), typeof caseData.updates);

  // 3. GET case detail — not found
  console.log('\n3. GET non-existent case');
  const nfRes = await authedFetch(
    `${BASE}/api/operator/cases/KC-9999-999999`,
    {},
    opLogin.cookies
  );
  assert('Non-existent case returns 404', nfRes.status === 404, `status=${nfRes.status}`);

  // 4. GET available resources
  console.log('\n4. GET available resources');
  const resRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}/assign`,
    {},
    opLogin.cookies
  );
  const resData = await resRes.json();
  assert('Resources returns 200', resRes.status === 200, `status=${resRes.status}`);
  assert('Has responders', resData.responders?.length > 0, `responders=${resData.responders?.length}`);
  assert('Has ambulances', resData.ambulances?.length > 0, `ambulances=${resData.ambulances?.length}`);

  // 5. POST assignment — OPERATOR assigns responder
  console.log('\n5. POST assignment as OPERATOR');
  const responderId = resData.responders[0].id;
  const ambulanceId = resData.ambulances[0].id;
  const assignRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responderId, ambulanceId }),
    },
    opLogin.cookies
  );
  const assignData = await assignRes.json();
  assert('Assignment returns 201', assignRes.status === 201, `status=${assignRes.status}`);
  assert('Assignment has assignmentId', !!assignData.assignmentId, JSON.stringify(assignData));
  assert('Assignment has responderName', !!assignData.responderName, assignData.responderName);

  // 6. Verify assignment appears in case detail
  console.log('\n6. Verify assignment in case detail');
  const caseRes2 = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}`,
    {},
    opLogin.cookies
  );
  const caseData2 = await caseRes2.json();
  assert('Case status is ASSIGNED', caseData2.status === 'ASSIGNED', `status=${caseData2.status}`);
  assert('Case has 1+ assignments', caseData2.assignments?.length >= 1, `assignments=${caseData2.assignments?.length}`);
  const hasAssignUpdate = caseData2.updates?.some(u => u.updateType === 'AMBULANCE_ASSIGNED');
  assert('Audit timeline has assignment entry', hasAssignUpdate, 'no AMBULANCE_ASSIGNED update');

  // 7. POST operator note
  console.log('\n7. POST operator note');
  const noteRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}/notes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'M11 test note — verified coordination flow.' }),
    },
    opLogin.cookies
  );
  const noteData = await noteRes.json();
  assert('Note returns 201', noteRes.status === 201, `status=${noteRes.status}`);
  assert('Note has success flag', noteData.success === true, JSON.stringify(noteData));

  // 8. Auth protection — CITIZEN cannot access operator APIs
  console.log('\n8. Auth protection — CITIZEN blocked');
  const citLogin = await login('CITIZEN');
  assert('Citizen login returns 200', citLogin.ok);

  const citAssignRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responderId: 'fake' }),
    },
    citLogin.cookies
  );
  assert('Citizen assign returns 403', citAssignRes.status === 403, `status=${citAssignRes.status}`);

  const citCaseRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}`,
    {},
    citLogin.cookies
  );
  assert('Citizen case detail returns 403', citCaseRes.status === 403, `status=${citCaseRes.status}`);

  const citNoteRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}/notes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hack' }),
    },
    citLogin.cookies
  );
  assert('Citizen note returns 403', citNoteRes.status === 403, `status=${citNoteRes.status}`);

  // 9. Auth protection — RESPONDER cannot access operator APIs
  console.log('\n9. Auth protection — RESPONDER blocked');
  const respLogin = await login('RESPONDER');
  assert('Responder login returns 200', respLogin.ok);

  const respAssignRes = await authedFetch(
    `${BASE}/api/operator/cases/${caseCode}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responderId: 'fake' }),
    },
    respLogin.cookies
  );
  assert('Responder assign returns 403', respAssignRes.status === 403, `status=${respAssignRes.status}`);

  // 10. Unauthenticated access
  console.log('\n10. Unauthenticated access blocked');
  const noAuthRes = await fetch(`${BASE}/api/operator/cases/${caseCode}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'no auth' }),
  });
  assert('Unauthenticated note returns 401', noAuthRes.status === 401, `status=${noAuthRes.status}`);

  const noAuthCaseRes = await fetch(`${BASE}/api/operator/cases/${caseCode}`);
  assert('Unauthenticated case detail returns 401', noAuthCaseRes.status === 401, `status=${noAuthCaseRes.status}`);

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

const res = await fetch('http://localhost:4000/api/v1/otp/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'debug6@example.com', purpose: 'EMAIL_VERIFICATION' }),
});
const json = await res.json();
console.log('status:', res.status);
console.log('json:', JSON.stringify(json, null, 2));
console.log('json.data:', json.data);
console.log('json.data.data:', json.data?.data);
console.log('json.data.expiresInMinutes:', json.data?.expiresInMinutes);
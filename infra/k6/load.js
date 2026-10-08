// k6 load test — Stage A target: 300 rps p95 < 300ms on 1 app VM (4 vCPU) + 1 DB VM.
// Run: k6 run -e API=https://api.aadhyay.com -e TENANT=<slug> -e TOKEN=<staff access token> infra/k6/load.js
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  scenarios: {
    morning_peak: { executor: 'ramping-arrival-rate', startRate: 20, timeUnit: '1s', preAllocatedVUs: 200,
      stages: [{ target: 150, duration: '2m' }, { target: 300, duration: '5m' }, { target: 0, duration: '1m' }] },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] },
};
const H = { headers: { authorization: `Bearer ${__ENV.TOKEN}`, 'x-tenant': __ENV.TENANT } };
export default function () {
  const r = Math.random();
  const url = r < 0.4 ? '/v1/people/students?limit=50' : r < 0.7 ? '/v1/comms/notices' : r < 0.9 ? '/v1/fees/defaulters' : '/v1/health';
  const res = http.get(`${__ENV.API}${url}`, H);
  check(res, { ok: (x) => x.status < 400 });
  sleep(0.2);
}

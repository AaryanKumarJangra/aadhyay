import { useState } from 'react';
import { router } from 'expo-router';
import { Screen, Field, Button, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { saveLogin, session } from '@/lib/session';
import { LOCKED_TENANT } from '@/lib/config';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [channel, setChannel] = useState('');
  async function request() {
    setBusy(true); setErr('');
    try { const r = await api('/auth/otp/request', { body: { phone }, auth: false }); setChannel(r.channel); if (r.devCode) setCode(r.devCode); setStep('code'); } catch (e) { setErr((e as ApiError).message); }
    setBusy(false);
  }
  async function verify() {
    setBusy(true); setErr('');
    try {
      const j = await api('/auth/otp/verify', { auth: false, body: { phone, code, deviceId: session.get().deviceId, platform: 'android', tenantSlug: session.get().tenantSlug ?? undefined } });
      await saveLogin(j);
      if (session.get().tenantSlug && !j.tenantId) {
        const m = j.memberships.find((x: any) => x.tenantSlug === session.get().tenantSlug);
        if (m) { const sw = await api('/auth/switch-tenant', { body: { tenantId: m.tenantId } }); session.set({ accessToken: sw.accessToken }); }
        else if (LOCKED_TENANT) setErr('This number is not registered with the institution. Please contact the office.');
      }
      router.replace('/');
    } catch (e) { setErr((e as ApiError).message); }
    setBusy(false);
  }
  return (
    <Screen title="Log in">
      {step === 'phone' ? (<>
        <T muted>We’ll send a 6-digit code on WhatsApp or SMS.</T>
        <Field label="Mobile number" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} placeholder="98765 43210" />
        <Button title="Get OTP" onPress={request} loading={busy} disabled={phone.replace(/\D/g, '').length < 10} />
      </>) : (<>
        <T muted>Code sent on {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to {phone}</T>
        <Field label="OTP" keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} />
        <Button title="Verify & log in" onPress={verify} loading={busy} disabled={code.length !== 6} />
        <Button title="Change number" variant="secondary" onPress={() => setStep('phone')} />
      </>)}
      {!!err && <T style={{ color: '#DC2626' }}>{err}</T>}
    </Screen>
  );
}

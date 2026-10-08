import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Screen, T, Button } from '@/components/ui';
import { api } from '@/lib/api';

/** Fee payment via Razorpay Checkout inside a WebView. Money goes to the institution's own account. */
export default function Pay() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [done, setDone] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    (async () => {
      const l = await api(`/fees/students/${studentId}/ledger`);
      const ids = l.lines.filter((x: any) => x.outstandingPaise > 0).map((x: any) => x.id);
      setOrder(await api('/fees/online/init', { body: { studentId, studentFeeIds: ids } }));
    })().catch((e) => setErr(e.message));
  }, [studentId]);
  async function confirm(p: { razorpay_payment_id: string; razorpay_signature: string }) {
    try { setDone(await api('/fees/online/confirm', { body: { orderId: order.orderId, paymentId: p.razorpay_payment_id, signature: p.razorpay_signature } })); } catch (e: any) { setErr(e.message); }
  }
  if (done) return <Screen title="Payment successful ✅"><T>Receipt {done.number}</T><Button title="Done" onPress={() => router.back()} /></Screen>;
  if (err) return <Screen title="Payment"><T style={{ color: '#DC2626' }}>{err}</T><Button title="Back" onPress={() => router.back()} /></Screen>;
  if (!order) return <Screen title="Payment"><T muted>Preparing secure payment…</T></Screen>;
  if (order.keyId === 'rzp_log') return <Screen title="Test payment"><T>Development gateway — no real money.</T><Button title="Simulate success" onPress={() => confirm({ razorpay_payment_id: 'pay_dev_app', razorpay_signature: 'log' })} /></Screen>;
  const html = `<html><head><meta name="viewport" content="width=device-width"><script src="https://checkout.razorpay.com/v1/checkout.js"></script></head><body><script>
    new Razorpay({ key: ${JSON.stringify(order.keyId)}, order_id: ${JSON.stringify(order.orderId)}, amount: ${order.amountPaise}, currency: 'INR', name: 'School fees',
      handler: function (r) { window.ReactNativeWebView.postMessage(JSON.stringify(r)); }, modal: { ondismiss: function () { window.ReactNativeWebView.postMessage('dismiss'); } } }).open();
  </script></body></html>`;
  return <WebView source={{ html }} onMessage={(e) => (e.nativeEvent.data === 'dismiss' ? router.back() : confirm(JSON.parse(e.nativeEvent.data)))} />;
}

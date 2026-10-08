import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices, RTCView, type MediaStream } from 'react-native-webrtc';
import { io, type Socket } from 'socket.io-client';
import { Screen, Button, T } from '@/components/ui';
import { api } from '@/lib/api';
import { session } from '@/lib/session';
import { REALTIME } from '@/lib/config';

/**
 * 1:1 voice/video call: WebRTC peer-to-peer (DTLS-SRTP, end-to-end), TURN relay only when needed (coturn).
 * Signalling relayed by the /calls namespace. Group calls use LiveKit (token from /messenger/calls).
 * `callId` param present → answering an incoming call.
 */
export default function Call() {
  const { id, kind, peer, callId: incoming } = useLocalSearchParams<{ id: string; kind: 'voice' | 'video'; peer: string; callId?: string }>();
  const [status, setStatus] = useState(incoming ? 'Connecting…' : 'Ringing…');
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const sock = useRef<Socket | null>(null);
  const callId = useRef<string>(incoming ?? '');

  useEffect(() => {
    (async () => {
      const setup = incoming ? await api(`/messenger/calls/${incoming}/join`, { method: 'POST' }) : await api('/messenger/calls', { body: { conversationId: id, kind } });
      callId.current = setup.callId;
      if (setup.mode === 'sfu') return setStatus('Group call — opening conference…');
      const conn = new RTCPeerConnection({ iceServers: setup.ice.iceServers });
      pc.current = conn;
      const stream = await mediaDevices.getUserMedia({ audio: true, video: kind === 'video' ? { facingMode: 'user' } : false });
      setLocal(stream);
      stream.getTracks().forEach((tr) => conn.addTrack(tr, stream));
      (conn as any).addEventListener('track', (e: any) => { setRemote(e.streams[0]); setStatus('Connected'); });
      const s = io(`${REALTIME}/calls`, { auth: { token: session.get().accessToken }, transports: ['websocket'] });
      sock.current = s;
      (conn as any).addEventListener('icecandidate', (e: any) => e.candidate && s.emit('call.ice', { callId: callId.current, toUserId: peer, payload: e.candidate }));
      s.on('call.offer', async (m: any) => { await conn.setRemoteDescription(new RTCSessionDescription(m.payload)); const a = await conn.createAnswer(); await conn.setLocalDescription(a); s.emit('call.answer', { callId: callId.current, toUserId: m.from, payload: a }); });
      s.on('call.answer', async (m: any) => conn.setRemoteDescription(new RTCSessionDescription(m.payload)));
      s.on('call.ice', async (m: any) => conn.addIceCandidate(new RTCIceCandidate(m.payload)).catch(() => undefined));
      s.on('call.end', () => hangup(false));
      s.on('call.reject', () => { setStatus('Declined'); setTimeout(() => router.back(), 1200); });
      if (!incoming) {
        const offer = await conn.createOffer({});
        await conn.setLocalDescription(offer);
        s.on('connect', () => s.emit('call.offer', { callId: callId.current, toUserId: peer, payload: offer }));
      }
    })().catch((e) => setStatus(e.message));
    return () => hangup(false);
  }, []);
  function hangup(notify = true) {
    if (notify && callId.current) { sock.current?.emit('call.end', { callId: callId.current, toUserId: peer, payload: null }); void api(`/messenger/calls/${callId.current}/end`, { method: 'POST' }).catch(() => undefined); }
    local?.getTracks().forEach((t) => t.stop());
    pc.current?.close(); sock.current?.close();
    if (notify) router.back();
  }
  return (
    <Screen title={kind === 'video' ? 'Video call' : 'Voice call'} scroll={false}>
      <T muted>🔒 {status}</T>
      {kind === 'video' && <View style={{ flex: 1, gap: 8 }}>{remote && <RTCView streamURL={remote.toURL()} style={{ flex: 1, borderRadius: 16 }} objectFit="cover" />}{local && <RTCView streamURL={local.toURL()} style={{ height: 160, width: 110, alignSelf: 'flex-end', borderRadius: 12 }} mirror />}</View>}
      <Button title="End call" variant="danger" onPress={() => hangup(true)} />
    </Screen>
  );
}

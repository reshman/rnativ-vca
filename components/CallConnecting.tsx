import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  RTCView
} from "react-native-webrtc";

import Constants from 'expo-constants';

function hostForDev() {
  // If running with Expo dev server on LAN, use that host
  const hostUri = (Constants.expoConfig as any)?.hostUri;
  if (hostUri) return hostUri.split(':')[0];
  // Fallbacks
  if (Platform.OS === 'android') return '192.168.1.15'; // AVD -> host
  return 'localhost';                                 // iOS sim / web
}
console.log('hostForDev', hostForDev())
const SIGNALING_URL = `ws://${hostForDev()}:8080`;
console.log(SIGNALING_URL);
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  // For production add your TURN here for NAT-restricted networks
  // { urls: 'turn:YOUR_TURN', username: 'user', credential: 'pass' }
];
const CallConnecting = () => {

  const [roomId, setRoomId] = useState('test-room');
  const [isConnected, setIsConnected] = useState(false);
  const [isCaller, setIsCaller] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const askPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ]);
      const camOk = granted[PermissionsAndroid.PERMISSIONS.CAMERA] === 'granted';
      const micOk = granted[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === 'granted';
      if (!camOk || !micOk) throw new Error('Camera/Mic permission denied');
    }
  };

  const openMedia = async () => {
    const devices:any = await mediaDevices.enumerateDevices();
    const videoInput = devices.find(d => d.kind === 'videoinput'); //can do it later
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: 'user' }                              // fallback lets OS choose
    });

    setLocalStream(stream);
    return stream;
  };

  const sendWS = (payload: any) => {
    try {
      wsRef.current && wsRef.current.readyState === 1 && wsRef.current.send(JSON.stringify(payload));
    } catch (e) {
      console.warn('WS send error', e);
    }
  };

  const createPeer = () => {
    if (typeof RTCPeerConnection !== 'function') {
      throw new Error('react-native-webrtc not installed in this build');
    }
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) sendWS({ type: 'ice', candidate: event.candidate, roomId });
    };

    pc.onconnectionstatechange = () => {
      console.log('PC state:', pc.connectionState);
      if (pc.connectionState === 'failed') {
        Alert.alert('Connection failed');
      }
    };

    // ontrack for remote media
    const inbound = new MediaStream();
    pc.ontrack = (e: any) => {
      e.streams[0].getTracks().forEach(() => {}); // keep ref
      setRemoteStream(e.streams[0] || inbound);
    };

    pcRef.current = pc;
    return pc;
  };

  const connectWS = () => {
    return new Promise((resolve, reject) => {
      wsRef.current = new WebSocket(SIGNALING_URL);
      wsRef.current.onopen = () => resolve();
      wsRef.current.onerror = (e) => reject(e.message);
      wsRef.current.onclose = () => {
        setIsConnected(false);
        console.log('WS closed');
      };
      wsRef.current.onmessage = async (msg) => {
        const data = JSON.parse(msg.data);
        if (!pcRef.current && data.type !== 'joined') return;

        switch (data.type) {
          case 'joined':
            setIsConnected(true);
            console.log('Joined room');
            break;
          case 'offer':
            await handleOffer(data.offer);
            break;
          case 'answer':
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            break;
          case 'ice':
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (err) {
              console.warn('Error adding ICE', err);
            }
            break;
          default:
            break;
        }
      };
    });
  };

  const handleOffer = async (offer: any) => {
    try {
      const stream = localStream || (await openMedia());
      const pc = pcRef.current || createPeer();
      if (stream && pc.getSenders().length === 0) {
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      }
      await connectWS();
      sendWS({ type: 'join', roomId });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendWS({ type: 'answer', answer, roomId });
    } catch (err) {
      Alert.alert('Handle offer error', String(err?.message || err));
    }
  };

  const startCall = async () => {
    try {
      await askPermissions();
      const stream = await openMedia();
      const pc = createPeer();
      stream.getTracks().forEach((t: MediaStreamTrack) => pc.addTrack(t, stream));
  
      await connectWS();
      sendWS({ type: 'join', roomId });
  
      setIsCaller(true);
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      sendWS({ type: 'offer', offer, roomId });
    } catch (err) {
      Alert.alert('Start call error', String(err?.message || err));
    }
  }

  useEffect(() => {
    startCall();
    return () => {
      wsRef.current?.close();
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
      pcRef.current = null;
      localStream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hangup = () => {
    sendWS({ type: 'leave', roomId });
    cleanup();
  };

  const cleanup = () => {
    try {
      pcRef.current?.getSenders()?.forEach((s) => s.track && s.track.stop());
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    try {
      localStream?.getTracks()?.forEach((t) => t.stop());
    } catch {}
    setLocalStream(null);
    setRemoteStream(null);

    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    setIsConnected(false);
    setIsCaller(false);
    router.back()
  };

  return (
    <View style={styles.container}>
      {/* Center only the title */}
      <View style={styles.content}>
        <Text style={styles.title}>CallConnecting</Text>
      </View>

      <View>
        {localStream ? (
          <RTCView
            streamURL={localStream.toURL()}
            style={{ width: '100%', height: 200 }}
            objectFit="cover"
            mirror
          />
        ) : null}


        <Text style={styles.section}>Remote</Text>
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={{ width: '100%', height: 260, borderRadius: 8 }}
            objectFit="cover"
          />
        ) : (
          <View style={{ height: 260, borderRadius: 8, borderWidth: 1, borderColor: '#999', padding: 8 }}>
            <Text>Remote video will appear here</Text>
          </View>
        )}
      </View>

      {/* Button stays at the bottom, centered horizontally */}
      <TouchableOpacity style={styles.callBtn} onPress={hangup}>
        <Text style={styles.callBtnText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
};

export default CallConnecting;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  // This takes remaining space so the button sits below it
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  callBtn: {
    backgroundColor: "red",
    height: 40,
    minWidth: 120,
    borderRadius: 8,
    alignSelf: "center",     // center horizontally
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    marginBottom: 24,        // give some bottom space
  },
  callBtnText: {
    fontWeight: "600",
    color: "#ffffff",
  },

  video: { width: '100%', height: 220, backgroundColor: '#000', borderRadius: 12 },
  placeholder: { width: '100%', height: 220, borderRadius: 12, borderWidth: 1},
  section: { fontWeight: '600', marginTop: 10, marginBottom: 6 },
});

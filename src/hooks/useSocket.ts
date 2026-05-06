import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import * as Crypto from "../lib/crypto";

// --- Types ---
type Mode = "sender" | "receiver";
type StepStatus = "idle" | "in-progress" | "done" | "error";

interface Step {
  id: number;
  label: string;
  status: StepStatus;
  icon: string; // icon name key
}

interface ReceivedFile {
  name: string;
  data: string;
}

interface UseSocketReturn {
  isConnected: boolean;
  peerCount: number;
  statusMessage: string;
  senderSteps: Step[];
  receiverSteps: Step[];
  receivedFile: ReceivedFile | null;
  joinSession: (sessionId: string) => void;
  // Sender actions
  selectFile: (file: File) => void;
  syncSessionKey: () => Promise<void>;
  transferFile: () => Promise<void>;
  // Receiver actions
  initHandshake: () => Promise<void>;
  // Mode
  mode: Mode;
  setMode: (m: Mode) => void;
  // Session
  sessionId: string;
  setSessionId: (s: string) => void;
}

const SENDER_STEPS: Step[] = [
  { id: 1, label: "Acquire Handshake", status: "idle", icon: "Search" },
  { id: 2, label: "Stage Payload", status: "idle", icon: "FileText" },
  { id: 3, label: "Encrypt Key Vector", status: "idle", icon: "Key" },
  { id: 4, label: "Uplink Data", status: "idle", icon: "Send" },
];

const RECEIVER_STEPS: Step[] = [
  { id: 1, label: "Broadcast Handshake", status: "idle", icon: "RefreshCw" },
  { id: 2, label: "Resolve Access", status: "idle", icon: "Lock" },
  { id: 3, label: "Decrypt Payload", status: "idle", icon: "Download" },
];

function updateStep(steps: Step[], id: number, status: StepStatus): Step[] {
  return steps.map((s) => (s.id === id ? { ...s, status } : s));
}

export default function useSocket(): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState(
    "CYPHER-OS v4.0.2 INITIALIZED..."
  );

  const [mode, setMode] = useState<Mode>("sender");
  const [sessionId, setSessionId] = useState("");

  // Step states
  const [senderSteps, setSenderSteps] = useState<Step[]>([...SENDER_STEPS]);
  const [receiverSteps, setReceiverSteps] = useState<Step[]>([
    ...RECEIVER_STEPS,
  ]);

  // Crypto state (kept in refs to avoid stale closures)
  const keyPairRef = useRef<CryptoKeyPair | null>(null);
  const remotePublicKeyRef = useRef<CryptoKey | null>(null);
  const sessionKeyRef = useRef<CryptoKey | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const [receivedFile, setReceivedFile] = useState<ReceivedFile | null>(null);

  // --- Socket.IO Connection ---
  useEffect(() => {
    const socket = io();
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setStatusMessage("LINK ESTABLISHED. AWAITING DIRECTIVE.");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
      setPeerCount(0);
      setStatusMessage("LINK SEVERED. ATTEMPTING RECONNECT...");
    });

    socket.on("peer-joined", (count: number) => {
      setPeerCount(count);
      setStatusMessage(`PEER NODE ONLINE. CLUSTER SIZE: ${count}`);
    });

    socket.on("peer-left", (count: number) => {
      setPeerCount(count);
      setStatusMessage(`PEER NODE OFFLINE. CLUSTER SIZE: ${count}`);
    });

    // --- Sender: receive receiver's public key ---
    socket.on("receive-public-key", async (jwk: JsonWebKey) => {
      try {
        const importedKey = await Crypto.importPublicKey(jwk);
        remotePublicKeyRef.current = importedKey;
        setSenderSteps((prev) => updateStep(prev, 1, "done"));
        setStatusMessage("Target Public Key Imported. Handshake Secure.");
      } catch (err) {
        setSenderSteps((prev) => updateStep(prev, 1, "error"));
        setStatusMessage("Handshake Failed: Invalid Key Signature.");
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // --- Receiver: listen for encrypted session key and file ---
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const keyListener = async (encryptedBase64: string) => {
      const kp = keyPairRef.current;
      if (!kp) {
        setStatusMessage("Crypto Failure: No key pair generated.");
        setReceiverSteps((prev) => updateStep(prev, 2, "error"));
        return;
      }
      setReceiverSteps((prev) => updateStep(prev, 2, "in-progress"));
      try {
        const decryptedKey = await Crypto.decryptSessionKey(
          encryptedBase64,
          kp.privateKey
        );
        sessionKeyRef.current = decryptedKey;
        setReceiverSteps((prev) => updateStep(prev, 2, "done"));
        setStatusMessage("Access Resolved. Tunnel Established.");
      } catch (err) {
        setReceiverSteps((prev) => updateStep(prev, 2, "error"));
        setStatusMessage("Crypto Failure: Key Mismatch Detected.");
      }
    };

    const fileListener = async ({
      chunk,
      fileName,
      type,
    }: {
      chunk: string;
      fileName: string;
      type: string;
    }) => {
      const sk = sessionKeyRef.current;
      if (!sk) {
        setStatusMessage("Integrity Violation: No session key.");
        setReceiverSteps((prev) => updateStep(prev, 3, "error"));
        return;
      }
      setReceiverSteps((prev) => updateStep(prev, 3, "in-progress"));
      try {
        const decrypted = await Crypto.decryptFile(chunk, sk);
        const blob = new Blob([decrypted], { type });
        const url = URL.createObjectURL(blob);
        setReceivedFile({ name: fileName, data: url });
        setReceiverSteps((prev) => updateStep(prev, 3, "done"));
        setStatusMessage(`Payload Recovered: ${fileName}`);

        // Clear session key after successful transfer
        Crypto.clearKey(sk);
        sessionKeyRef.current = null;
      } catch (err) {
        setReceiverSteps((prev) => updateStep(prev, 3, "error"));
        setStatusMessage("Integrity Violation: Data Corrupted.");
      }
    };

    socket.on("receive-session-key", keyListener);
    socket.on("receive-file-chunk", fileListener);

    return () => {
      socket.off("receive-session-key", keyListener);
      socket.off("receive-file-chunk", fileListener);
    };
  }, []);

  // --- Actions ---

  const joinSession = useCallback(
    (sid: string) => {
      if (!sid) return;
      socketRef.current?.emit("join-session", sid);
      setStatusMessage("Node Linked to Cluster: " + sid);
    },
    []
  );

  const selectFile = useCallback((file: File) => {
    selectedFileRef.current = file;
    setSenderSteps((prev) => updateStep(prev, 2, "done"));
    setStatusMessage(`Payload Staged: ${file.name}`);
  }, []);

  const syncSessionKey = useCallback(async () => {
    const pubKey = remotePublicKeyRef.current;
    if (!pubKey) {
      setStatusMessage("Sync Failed: No remote public key.");
      return;
    }
    setSenderSteps((prev) => updateStep(prev, 3, "in-progress"));
    try {
      const sKey = await Crypto.generateSessionKey();
      sessionKeyRef.current = sKey;
      const encrypted = await Crypto.encryptSessionKey(sKey, pubKey);
      socketRef.current?.emit("send-session-key", {
        sessionId,
        encryptedKey: encrypted,
      });
      setSenderSteps((prev) => updateStep(prev, 3, "done"));
      setStatusMessage("Vector Sync Complete.");
    } catch (err) {
      setSenderSteps((prev) => updateStep(prev, 3, "error"));
      setStatusMessage("Sync Failed: Encryption Error.");
    }
  }, [sessionId]);

  const transferFile = useCallback(async () => {
    const file = selectedFileRef.current;
    const sk = sessionKeyRef.current;
    if (!file || !sk) {
      setStatusMessage("Uplink Failed: No file or session key.");
      return;
    }
    setSenderSteps((prev) => updateStep(prev, 4, "in-progress"));
    try {
      const arrayBuffer = await file.arrayBuffer();
      const encrypted = await Crypto.encryptFile(arrayBuffer, sk);
      socketRef.current?.emit("send-file-chunk", {
        sessionId,
        chunk: encrypted,
        fileName: file.name,
        type: file.type,
      });
      setSenderSteps((prev) => updateStep(prev, 4, "done"));
      setStatusMessage("Uplink Successful.");

      // Clear session key after successful transfer
      Crypto.clearKey(sk);
      sessionKeyRef.current = null;
    } catch (err) {
      setSenderSteps((prev) => updateStep(prev, 4, "error"));
      setStatusMessage("Uplink Failed: Encryption Error.");
    }
  }, [sessionId]);

  const initHandshake = useCallback(async () => {
    setReceiverSteps((prev) => updateStep(prev, 1, "in-progress"));
    try {
      const pair = await Crypto.generateKeyPair();
      keyPairRef.current = pair;
      const jwk = await Crypto.exportPublicKey(pair.publicKey);
      socketRef.current?.emit("send-public-key", {
        sessionId,
        publicKey: jwk,
      });
      setReceiverSteps((prev) => updateStep(prev, 1, "done"));
      setStatusMessage("Handshake Broadcast Active.");
    } catch (err) {
      setReceiverSteps((prev) => updateStep(prev, 1, "error"));
      setStatusMessage("Handshake Failed: Key Generation Error.");
    }
  }, [sessionId]);

  return {
    isConnected,
    peerCount,
    statusMessage,
    senderSteps,
    receiverSteps,
    receivedFile,
    joinSession,
    selectFile,
    syncSessionKey,
    transferFile,
    initHandshake,
    mode,
    setMode,
    sessionId,
    setSessionId,
  };
}

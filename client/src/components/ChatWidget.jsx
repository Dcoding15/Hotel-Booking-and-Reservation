import { useEffect, useRef, useState } from 'react';
import { api, getSocket } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState('');
  const openRef = useRef(false);
  const endRef = useRef(null);
  openRef.current = open;
  const isCustomer = user?.role === 'customer';

  useEffect(() => {
    if (!isCustomer) return undefined;
    api.get('/chat/me').then((r) => setMessages(r.data));
    const socket = getSocket();
    const onMsg = (m) => {
      setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
      if (m.senderRole === 'admin' && !openRef.current) setUnread((n) => n + 1);
    };
    socket.on('chat:message', onMsg);
    return () => socket.off('chat:message', onMsg);
  }, [isCustomer, user?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages, open]);

  if (!isCustomer) return null;

  function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    getSocket().emit('chat:send', { text });
    setText('');
  }

  return (
    <div className="chat">
      {open && (
        <div className="chat-panel">
          <div className="chat-head">Roomkey support <button className="link" onClick={() => setOpen(false)} aria-label="Close chat" style={{textDecoration: "none"}}>✕</button></div>
          <div className="msgs">
            {messages.length === 0 && <p className="muted small">Ask about a booking or a room. A team member will reply here.</p>}
            {messages.map((m) => <p key={m._id} className={`msg ${m.senderRole === 'customer' ? 'me' : ''}`}>{m.text}</p>)}
            <div ref={endRef} />
          </div>
          <form className="composer" onSubmit={send}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" />
            <button className="btn">Send</button>
          </form>
        </div>
      )}
      <button className="btn chat-fab" onClick={() => { setOpen(!open); setUnread(0); }}>
        Support{unread > 0 && <span className="dot">{unread}</span>}
      </button>
    </div>
  );
}

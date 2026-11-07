import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getSocket } from '../api.js';

export default function AdminSupport() {
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);   // customer object
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const activeRef = useRef(null);
  const endRef = useRef(null);
  activeRef.current = active;

  const loadThreads = useCallback(() => api.get('/chat/threads').then((r) => setThreads(r.data)), []);

  useEffect(() => {
    loadThreads();
    const socket = getSocket();
    const onMsg = (m) => {
      if (activeRef.current && m.customer === activeRef.current._id) {
        setMessages((prev) => (prev.some((x) => x._id === m._id) ? prev : [...prev, m]));
        if (m.senderRole === 'customer') socket.emit('chat:read', { customerId: m.customer });
      }
      loadThreads();
    };
    socket.on('chat:message', onMsg);
    return () => socket.off('chat:message', onMsg);
  }, [loadThreads]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  async function open(customer) {
    setActive(customer);
    const { data } = await api.get(`/chat/threads/${customer._id}`);
    setMessages(data);
    getSocket().emit('chat:read', { customerId: customer._id });
    setTimeout(loadThreads, 200);
  }

  function send(e) {
    e.preventDefault();
    if (!text.trim() || !active) return;
    getSocket().emit('chat:send', { text, customerId: active._id });
    setText('');
  }

  return (
    <>
      <h1>Support desk</h1>
      <div className="desk">
        <ul className="threads">
          {threads.length === 0 && <li className="muted">No conversations yet. They appear here when a customer writes in.</li>}
          {threads.map((t) => (
            <li key={t._id}>
              <button className={active?._id === t.customer?._id ? 'on' : ''} onClick={() => open(t.customer)}>
                <strong>
                  {t.customer?.name || t.customer?.email}
                  {t.unreadForAdmin > 0 && <span className="dot" aria-label="Unread messages" />}
                </strong>
                <small className="muted">{t.lastMessage}</small>
              </button>
            </li>
          ))}
        </ul>
        <section className="convo">
          {!active ? <p className="muted pad">Select a conversation to read and reply.</p> : (
            <>
              <div className="convo-head"><strong>{active.name}</strong> <span className="muted small">{active.email}</span></div>
              <div className="msgs">
                {messages.map((m) => <p key={m._id} className={`msg ${m.senderRole === 'admin' ? 'me' : ''}`}>{m.text}</p>)}
                <div ref={endRef} />
              </div>
              <form className="composer" onSubmit={send}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply" />
                <button className="btn">Send reply</button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  );
}

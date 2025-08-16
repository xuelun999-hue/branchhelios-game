// packages/web/src/app/page.tsx (最终完整修复版)

"use client";

import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// --- 类型定义 ---
interface Message { sender: 'user' | 'npc'; text: string; npcName?: string; }
interface Npc { id: string; name: string; }
interface EchoChamberData { monologue: string; choice_a: string; choice_b: string; }

// --- Supabase 客户端初始化 ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function HomePage() {
  // --- 状态管理 ---
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerStatus, setPlayerStatus] = useState<string>('active');
  const [showEchoChamberPrompt, setShowEchoChamberPrompt] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [echoChamberData, setEchoChamberData] = useState<EchoChamberData | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // --- NPC 设定 ---
  const npcs: Npc[] = [
    { id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef', name: '盖亚' },
    { id: 'b2c3d4e5-f6a7-8901-2345-67890abcdef0', name: '凌晓' },
  ];

  // --- 效果钩子 ---
  useEffect(() => {
    const createPlayer = async () => {
      setIsLoading(true);
      try {
        const response = await axios.post('http://127.0.0.1:8000/api/create_character', { username: '亚历克斯' });
        if (response.data.player_id) {
          setPlayerId(response.data.player_id);
          setMessages([{ sender: 'npc', text: `欢迎来到赫利俄斯的世界，玩家 ${response.data.player_id.substring(0, 8)}...` }]);
        }
      } catch (error) { console.error("创建玩家失败:", error); } 
      finally { setIsLoading(false); }
    };
    createPlayer();
  }, []);

  useEffect(() => {
    if (!playerId) return;
    const channel = supabase.channel(`player-status-updates-${playerId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `id=eq.${playerId}` }, payload => {
      const newStatus = (payload.new as { status: string }).status;
      if (newStatus === 'requires_echo_chamber') {
        setShowEchoChamberPrompt(true);
      } else {
        setPlayerStatus('active');
        setShowEchoChamberPrompt(false);
        setEchoChamberData(null);
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [playerId]);

  useEffect(() => {
    if (playerStatus === 'requires_echo_chamber' && playerId) {
      const fetchEchoChamberData = async () => {
        setIsLoading(true);
        try {
          const response = await axios.post('http://127.0.0.1:8000/api/enter_echo_chamber', { player_id: playerId });
          setEchoChamberData(response.data);
        } catch (error) { console.error("获取回响之室数据失败:", error); } 
        finally { setIsLoading(false); }
      };
      fetchEchoChamberData();
    }
  }, [playerStatus, playerId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // --- 核心功能函数 ---
  const handleNpcChat = async (npc: Npc) => {
    if (!playerId || !userInput.trim()) return;
    const userMessage: Message = { sender: 'user', text: userInput };
    setMessages(prev => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);
    try {
      const response = await axios.post('http://127.0.0.1:8000/api/chat', { player_id: playerId, npc_id: npc.id, message: userInput });
      if (response.data.dialogue) {
        const npcMessage: Message = { sender: 'npc', text: response.data.dialogue, npcName: response.data.character_name };
        setMessages(prev => [...prev, npcMessage]);
      }
    } catch (error) { console.error(`与 ${npc.name} 对话失败:`, error); } 
    finally { setIsLoading(false); }
  };

  const handleEchoChamberChoice = async (choice: 'survival' | 'idealism') => {
    if (!playerId) return;
    setIsLoading(true);
    try {
      await axios.post('http://127.0.0.1:8000/api/resolve_echo_chamber', { player_id: playerId, choice: choice });
    } catch (error) { console.error("演化信念失败:", error); } 
    finally { setIsLoading(false); }
  };

  const enterEchoChamber = () => {
    setShowEchoChamberPrompt(false);
    setPlayerStatus('requires_echo_chamber');
  };

  // --- UI 渲染 ---
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'sans-serif', backgroundColor: playerStatus === 'requires_echo_chamber' ? '#00001a' : '#121212', color: 'white', transition: 'background-color 0.8s ease' }}>
      
      {/* 渲染主聊天界面 */}
      <div style={{ display: playerStatus === 'active' ? 'flex' : 'none', flexDirection: 'column', height: '100vh' }}>
        <header style={{ padding: '1rem', backgroundColor: 'rgba(30, 30, 30, 0.8)', borderBottom: '1px solid #333' }}>
          <h1>新弧光城 - 主页面</h1>
          <p style={{ color: '#aaa', fontSize: '0.9rem' }}>玩家 ID: {playerId ? playerId.substring(0, 8) + '...' : '正在连接...'}</p>
        </header>
        <main style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {messages.map((msg, index) => (
            <div key={index} style={{ marginBottom: '1rem', textAlign: msg.sender === 'user' ? 'right' : 'left' }}>
              <div style={{ display: 'inline-block', padding: '0.5rem 1rem', borderRadius: '1rem', backgroundColor: msg.sender === 'user' ? '#3737a1' : '#333', maxWidth: '70%' }}>
                {msg.sender === 'npc' && msg.npcName && <strong style={{ display: 'block', marginBottom: '0.25rem', color: '#87ceeb' }}>{msg.npcName}</strong>}
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && <p style={{ color: '#aaa', textAlign: 'center' }}>正在思考...</p>}
          <div ref={messagesEndRef} />
        </main>
        <footer style={{ padding: '1rem', backgroundColor: 'rgba(30, 30, 30, 0.8)', borderTop: '1px solid #333' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} placeholder="输入你的想法..." disabled={isLoading || !playerId} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #444', backgroundColor: '#222', color: 'white' }} onKeyDown={(e) => { if (e.key === 'Enter' && !isLoading) { handleNpcChat(npcs[0]); } }}/>
            {npcs.map(npc => (<button key={npc.id} onClick={() => handleNpcChat(npc)} disabled={isLoading || !playerId || !userInput.trim()} style={{ ...buttonStyle, opacity: (isLoading || !playerId || !userInput.trim()) ? 0.5 : 1 }}>问 {npc.name}</button>))}
          </div>
        </footer>
      </div>

      {/* 渲染确认对话框 */}
      {showEchoChamberPrompt && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3>『认知失调』事件触发</h3>
            <p style={{ margin: '1.5rem 0', color: '#ccc' }}>你的内在信念产生了冲突，这是一个深入探索自我的机会。</p>
            <p>是否愿意进入【回响之室】，聆听你内心的声音？</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={enterEchoChamber} style={buttonStyle}>愿意</button>
              <button onClick={() => setShowEchoChamberPrompt(false)} style={{...buttonStyle, backgroundColor: '#555'}}>暂时不了</button>
            </div>
          </div>
        </div>
      )}

      {/* 渲染回响之室 */}
      {playerStatus === 'requires_echo_chamber' && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } } @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(74, 74, 138, 0.4); } 70% { box-shadow: 0 0 0 20px rgba(74, 74, 138, 0); } 100% { box-shadow: 0 0 0 0 rgba(74, 74, 138, 0); } } .echo-chamber-content { animation: fadeIn 1.5s ease-out; } .echo-chamber-container { animation: pulse 2.5s infinite; }`}</style>
          <div className="echo-chamber-container" style={{ maxWidth: '600px', textAlign: 'center', padding: '3rem', border: '1px solid #333', borderRadius: '1rem', backgroundColor: '#1e1e1e' }}>
            <div className="echo-chamber-content">
              <h1 style={{ fontFamily: 'serif', color: '#87ceeb', letterSpacing: '0.1em' }}>【 回响之室 】</h1>
              {isLoading && <p>正在聆听你内心的声音...</p>}
              {echoChamberData && (
                <>
                  <p style={{ fontFamily: 'serif', fontStyle: 'italic', fontSize: '1.2rem', color: '#ccc', lineHeight: 1.8, margin: '2.5rem 0' }}>"{echoChamberData.monologue}"</p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '2rem' }}>
                    <button onClick={() => handleEchoChamberChoice('survival')} style={{...buttonStyle, transition: 'transform 0.2s'}} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>{echoChamberData.choice_a}</button>
                    <button onClick={() => handleEchoChamberChoice('idealism')} style={{...buttonStyle, transition: 'transform 0.2s'}} onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}>{echoChamberData.choice_b}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 辅助样式 ---
const buttonStyle: React.CSSProperties = { padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: 'none', backgroundColor: '#4a4a8a', color: 'white', cursor: 'pointer', fontSize: '1rem' };
const modalOverlayStyle: React.CSSProperties = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalContentStyle: React.CSSProperties = { backgroundColor: '#1e1e1e', padding: '2rem 3rem', borderRadius: '1rem', border: '1px solid #333', textAlign: 'center', animation: 'fadeIn 0.5s ease-out' };
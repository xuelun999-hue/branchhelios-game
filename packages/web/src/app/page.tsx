// packages/web/src/app/page.tsx (简体中文最终版)
'use client';

import { useState, useEffect } from 'react';

// --- 数据结构定义 ---
interface Message {
  role: 'user' | 'assistant';
  content: string;
  character_id: string; // 'player' 或 NPC 的 ID
}

// --- 简单的 NPC 数据库，用于显示名字和颜色 ---
const characters: { [key: string]: { name: string; color: string } } = {
  player: { name: '你', color: '#e1f5fe' },
  guard_elwin_craig: { name: '卫兵艾尔文', color: '#f0f4c3' },
  wanderer_karin: { name: '流浪者卡琳', color: '#ffe0b2' },
  priest_lyra: { name: '祭司莉拉', color: '#e0f2f1' },
  system: { name: '系统', color: '#f5f5f5'},
};

export default function HeliosMVP() {
  // --- 状态管理 ---
  const [gameState, setGameState] = useState<'creation' | 'chatting'>('creation');
  const [identity, setIdentity] = useState('');
  const [motivation, setMotivation] = useState('');
  const [playerId, setPlayerId] = useState('');
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const sceneId = 'opening_tavern_scene';

  // --- 函数：处理角色创建 ---
  const handleCharacterCreation = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!identity.trim() || !motivation.trim()) {
      alert('请输入您的身份和动机！');
      return;
    }
    setIsLoading(true);
    
    // 生成一个随机的玩家 ID
    const newPlayerId = `player_${Math.random().toString(36).substring(7)}`;
    setPlayerId(newPlayerId);

    try {
      // 调用我们在后端新建的“创世”API
      const response = await fetch('http://localhost:8000/api/create_character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: newPlayerId,
          identity,
          motivation
        }),
      });
      const data = await response.json();

      if (data.status === 'success') {
        // 角色创建成功，切换到聊天界面
        setGameState('chatting');
        // 加载酒馆场景的开场白
        const initialMessage: Message = {
          role: 'assistant',
          content: '你是新来的？我没在城里见过你。报上你的名字和来意。',
          character_id: 'guard_elwin_craig'
        };
        setMessages([initialMessage]);
      } else {
        alert(`角色创建失败: ${data.message}`);
      }
    } catch (error) {
      alert(`网络错误，无法创建角色: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  // --- 函数：处理聊天讯息提交 ---
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input, character_id: playerId };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      // 调用场景聊天 API
      const response = await fetch('http://localhost:8000/api/scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: sceneId, messages: newMessages }),
      });
      const data = await response.json();
      const assistantMessage: Message = { role: 'assistant', content: data.dialogue, character_id: data.character_id };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      const errorMessage: Message = { role: 'assistant', content: '场景好像出错了...', character_id: 'system' };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI 渲染 ---
  if (gameState === 'creation') {
    return (
      <div style={{ fontFamily: 'sans-serif', padding: '40px', maxWidth: '500px', margin: '100px auto', border: '1px solid #ddd', borderRadius: '10px' }}>
        <h2>创造你的角色</h2>
        <p style={{color: '#666'}}>你的选择将悄然塑造你的信念。</p>
        <form onSubmit={handleCharacterCreation}>
          <div style={{marginBottom: '15px'}}>
            <label>你是谁？</label>
            <input 
              style={{width: '100%', padding: '8px', marginTop: '5px'}}
              value={identity} 
              onChange={e => setIdentity(e.target.value)}
              placeholder="例如：一个刚来到港口城市的年轻人"
            />
          </div>
          <div style={{marginBottom: '20px'}}>
            <label>你来这里的目的是什么？</label>
            <input
              style={{width: '100%', padding: '8px', marginTop: '5px'}}
              value={motivation} 
              onChange={e => setMotivation(e.target.value)}
              placeholder="例如：想在这里出人头地"
            />
          </div>
          <button type="submit" style={{width: '100%', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px'}} disabled={isLoading}>
            {isLoading ? "正在创世..." : "进入赫利俄斯的世界"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '700px', margin: 'auto' }}>
      <h1>场景：酒馆角落</h1>
      <p style={{color: '#666'}}>故事开始于一个昏暗的酒馆角落...</p>
      <div style={{ border: '1px solid #ccc', padding: '10px', height: '500px', overflowY: 'scroll', marginBottom: '10px' }}>
        {messages.map((m, index) => (
          <div key={index} style={{ marginBottom: '10px', padding: '8px 12px', borderRadius: '8px', background: characters[m.character_id]?.color || '#fff' }}>
            <strong>{characters[m.character_id]?.name || m.character_id}:</strong>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.content}</p>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          style={{ width: 'calc(80% - 10px)', padding: '10px', marginRight: '10px' }}
          value={input}
          placeholder={isLoading ? "大家正在思考..." : "你想说什么..."}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" style={{ width: '20%', padding: '10px' }} disabled={isLoading}>
          {isLoading ? '...' : '发送'}
        </button>
      </form>
    </div>
  );
}
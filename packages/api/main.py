# packages/api/main.py (最终验证版)
import os
import yaml
import json
from openai import OpenAI
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# --- 明确地加载 .env 文件，这是被 test_deepseek.py 验证过的成功方法 ---
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path=dotenv_path)
    print("INFO:     成功从 .env 文件加载环境变量。")

# --- 初始化 FastAPI 应用 ---
app = FastAPI(title="Helios Agent Core", version="0.1.0")

# --- CORS 设定 ---
origins = ["*"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- 初始化 DeepSeek 客户端 ---
client = None
api_key = os.environ.get("OPENAI_API_KEY")
if api_key:
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com/v1")
    print(f"INFO:     DeepSeek client 初始化成功 (Key: {api_key[:5]}...{api_key[-4:]})。")
else:
    print("警告:     未能读取到 OPENAI_API_KEY，AI 对话功能将不可用。")

# --- 数据结构定义 (不变) ---
class Message(BaseModel):
    role: str
    content: str
    character_id: str

class CreateCharacterRequest(BaseModel):
    player_id: str
    identity: str
    motivation: str

class SceneRequest(BaseModel):
    scene_id: str
    messages: List[Message]

# --- 辅助函数 (不变) ---
def load_yaml(file_path: str) -> Dict[str, Any]:
    full_path = os.path.join(os.path.dirname(__file__), file_path)
    with open(full_path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

# --- API 端点 (create_character 不变) ---
@app.get("/")
def read_root():
    return {"message": "Helios Agent Core 正在运行 (使用 DeepSeek)", "version": "0.1.0"}

@app.post("/api/create_character")
async def create_character(request: CreateCharacterRequest):
    print(f"INFO:     收到为玩家 {request.player_id} 创建角色的请求...")
    initial_yaml_content = f"identity: \"{request.identity}\"\nmotivation: \"{request.motivation}\""
    print("--- 生成的初始信念种子 ---")
    print(initial_yaml_content)
    print("---------------------------------")
    print("INFO:     (模拟) 信念种子已成功保存。")
    return {"status": "success", "message": "角色成功创立！"}

@app.post("/api/scene")
async def handle_scene_chat(request: SceneRequest):
    # 3. --- 使用新的 OpenAI 格式来调用 DeepSeek API ---
    if not client:
        return {"character_id": "system", "dialogue": "错误：AI 大脑未连接（请检查 API Key）。", "action": "error"}

    print(f"INFO:     收到场景 <{request.scene_id}> 的聊天请求，正在调用 DeepSeek...")
    
    responding_npc_id = "guard_elwin_craig"
    if "卡琳" in request.messages[-1].content: responding_npc_id = "wanderer_karin"
    if "莉拉" in request.messages[-1].content: responding_npc_id = "priest_lyra"
    
    npc_beliefs = load_yaml(f"beliefs/{responding_npc_id}.yaml")
    conversation_history = "\n".join([f"{msg.character_id}: {msg.content}" for msg in request.messages])

    # DeepSeek 不支持 system prompt，我们将其合并到 messages 数组的第一条
    system_content = f"""你正在扮演游戏角色 {npc_beliefs['name']}。
    当前场景是：{load_yaml(f'scenes/{request.scene_id}.yaml')['description']}
    对话历史如下：
    {conversation_history}
    你的个人信念系统如下，请完全基于此来思考和回应：
    --- 信念系统开始 ---
    {yaml.dump(npc_beliefs, allow_unicode=True)}
    --- 信念系统结束 ---
    你的回应必须是一个 JSON 对象，包含 'dialogue' (string) 和 'action' (string) 两个键。
    """
    
    # 组合 messages
    api_messages = [
        {"role": "system", "content": system_content}
    ]
    for msg in request.messages:
        # DeepSeek 的 assistant 角色需要与 user 交替出现
        api_messages.append({"role": "user" if msg.role == 'user' else 'assistant', "content": msg.content})

    try:
        response = client.chat.completions.create(
            model="deepseek-chat", # 使用 DeepSeek 的聊天模型
            messages=api_messages,
            max_tokens=500,
            # 要求 DeepSeek 输出 JSON
            response_format={"type": "json_object"},
        )
        
        response_text = response.choices[0].message.content
        parsed_response = json.loads(response_text)
        
        final_response = {
            "character_id": responding_npc_id,
            "dialogue": parsed_response.get("dialogue", "我不知道该说什么..."),
            "action": parsed_response.get("action", "stands_silently")
        }
        return final_response

    except Exception as e:
        print(f"错误: 调用 DeepSeek API 时发生问题 - {e}")
        return {"character_id": "system", "dialogue": f"抱歉，我的 AI 大脑短路了: {e}", "action": "error"}
# packages/api/main.py (最终可执行的完整版)
import os
import json
from openai import OpenAI
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from supabase import create_client, Client

# --- 明确地加载 .env 文件 ---
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path=dotenv_path)
    print("INFO:     成功从 .env 文件加载环境变量。")

# --- 初始化 FastAPI 应用 ---
app = FastAPI(title="Helios Agent Core - Prism Heart MVP", version="0.2.0")

# --- CORS 设定 ---
origins = ["*"]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- 初始化 Supabase 客户端 ---
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase: Client = None
if supabase_url and supabase_key:
    supabase = create_client(supabase_url, supabase_key)
    print("INFO:     Supabase client 初始化成功。")
else:
    print("警告:     未能读取到 SUPABASE_URL 或 SUPABASE_KEY，数据库功能将不可用。")

# --- 初始化 DeepSeek 客户端 ---
client: OpenAI = None
api_key = os.environ.get("OPENAI_API_KEY")
if api_key:
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com/v1")
    print(f"INFO:     DeepSeek client 初始化成功 (Key: {api_key[:5]}...{api_key[-4:]})。")
else:
    print("警告:     未能读取到 OPENAI_API_KEY，AI 对话功能将不可用。")


# --- 新的数据结构定义 (Pydantic Models) ---
class CreateCharacterRequest(BaseModel):
    username: str # 简化为用户名即可

class ChatRequest(BaseModel):
    player_id: str
    npc_id: str
    message: str

class PlayerIdRequest(BaseModel):
    player_id: str

class ResolveRequest(BaseModel):
    player_id: str
    # 玩家的选择，例如 "survival" 或 "idealism"
    choice: str


# --- 根节点 ---
@app.get("/")
def read_root():
    return {"message": "Helios Agent Core 正在运行 (棱镜之心 MVP)", "version": "0.2.0"}


# --- API 端点 1: 创建角色 ---
@app.post("/api/create_character")
async def create_character(request: CreateCharacterRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="数据库未连接")
    
    print(f"INFO:     收到为玩家 {request.username} 创建角色的请求...")
    
    initial_beliefs = {"survival": 0.5, "idealism": 0.5}
    
    try:
        response = supabase.table("players").insert({
            "username": request.username,
            "belief_system": initial_beliefs,
            "status": "active"
        }).execute()
        
        if response.data:
            player_id = response.data[0]['id']
            print(f"INFO:     玩家 {request.username} (ID: {player_id}) 已成功创建并存入数据库。")
            return {"status": "success", "message": "角色成功创立！", "player_id": player_id}
        else:
            raise HTTPException(status_code=500, detail="创建角色失败，未收到数据库返回数据。")
            
    except Exception as e:
        print(f"错误:     数据库操作失败 - {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- API 端点 2: 核心对话 ---
@app.post("/api/chat")
async def handle_chat(request: ChatRequest):
    if not client or not supabase:
        raise HTTPException(status_code=500, detail="AI 或数据库未连接")

    try:
        player_res = supabase.table("players").select("*").eq("id", request.player_id).single().execute()
        npc_res = supabase.table("npcs").select("*").eq("id", request.npc_id).single().execute()
        player = player_res.data
        npc = npc_res.data
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"找不到玩家或NPC: {e}")

    # 使用 DeepSeek 获取 NPC 回应
    npc_response_prompt = f"""
你正在扮演游戏角色 {npc['name']}。
{npc['core_prompt']}
你正在与玩家 '{player['username']}' 对话。
玩家: {request.message}
你的回应必须是一个JSON对象，包含 'dialogue' (string) 键。
你:
"""
    try:
        npc_response_completion = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "system", "content": npc_response_prompt}],
            response_format={"type": "json_object"},
        )
        npc_response_obj = json.loads(npc_response_completion.choices[0].message.content)
        npc_dialogue = npc_response_obj.get("dialogue", "...")
    except Exception as e:
        print(f"错误:     获取NPC回应时出错 - {e}")
        npc_dialogue = "我的思绪有些混乱..."

    # 使用 DeepSeek 分析玩家输入的信念影响
    analysis_prompt = f"""
分析以下玩家言论的信念倾向。
玩家言论: '{request.message}'
判断这句话更偏向'survival'(生存务实)还是'idealism'(理想主义)。
以JSON格式返回一个评估，格式为 {{"survival": float, "idealism": float}}。
正值代表增强，负值代表减弱，两者之和应为0。
如果非常务实，返回 {{"survival": 0.1, "idealism": -0.1}}。
如果非常理想，返回 {{"survival": -0.1, "idealism": 0.1}}。
如果中立，返回 {{"survival": 0.0, "idealism": 0.0}}。
"""
    try:
        belief_impact_completion = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "system", "content": analysis_prompt}],
            response_format={"type": "json_object"},
        )
        belief_impact = json.loads(belief_impact_completion.choices[0].message.content)
    except Exception as e:
        print(f"错误:     分析信念影响时出错 - {e}")
        belief_impact = {"survival": 0.0, "idealism": 0.0}

    # 将互动记录为事件存入数据库
    supabase.table("events").insert({
        "player_id": request.player_id,
        "description": f"对 {npc['name']} 说: '{request.message}'",
        "belief_impact": belief_impact
    }).execute()
    
    print(f"INFO:     记录事件: 玩家 {player['username']} 的行为影响为 {belief_impact}")

    return {
        "character_id": npc['id'],
        "character_name": npc['name'],
        "dialogue": npc_dialogue
    }

# --- API 端点 3: 进入回响之室 ---
@app.post("/api/enter_echo_chamber")
async def enter_echo_chamber(request: PlayerIdRequest):
    if not client or not supabase:
        raise HTTPException(status_code=500, detail="AI 或数据库未连接")

    try:
        player_res = supabase.table("players").select("*").eq("id", request.player_id).single().execute()
        events_res = supabase.table("events").select("description").eq("player_id", request.player_id).order("created_at", desc=True).limit(10).execute()
        player = player_res.data
        events = events_res.data
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"找不到玩家数据: {e}")

    event_descriptions = "\n".join([f"- {e['description']}" for e in events])
    prompt = f"""
你是一个智慧的向导，正在引导玩家 '{player['username']}' 进行自我反思。
他们当前的核心信念是: {player['belief_system']}.
但他们最近的这些行为似乎产生了内在冲突:
{event_descriptions}

请生成一段深刻的、第一人称的内心独白来揭示这个矛盾。
独白最后，必须提出一个清晰的二选一问题，让他们在“生存务实”和“理想主义”之间选择。
以JSON格式返回结果: {{"monologue": "...", "choice_a": "成为一个务实的生存者", "choice_b": "成为一个追寻理想的人"}}
"""
    
    try:
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "system", "content": prompt}],
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        print(f"错误:     生成回响之室内容时出错 - {e}")
        raise HTTPException(status_code=500, detail="AI 大脑在生成自省内容时出错。")

# --- API 端点 4: 解决回响之室，演化信念 ---
@app.post("/api/resolve_echo_chamber")
async def resolve_echo_chamber(request: ResolveRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="数据库未连接")

    try:
        player_res = supabase.table("players").select("belief_system").eq("id", request.player_id).single().execute()
        current_beliefs = player_res.data['belief_system']

        adjustment = 0.1
        if request.choice == "survival":
            current_beliefs['survival'] = min(1.0, current_beliefs['survival'] + adjustment)
            current_beliefs['idealism'] = max(0.0, current_beliefs['idealism'] - adjustment)
        elif request.choice == "idealism":
            current_beliefs['survival'] = max(0.0, current_beliefs['survival'] - adjustment)
            current_beliefs['idealism'] = min(1.0, current_beliefs['idealism'] + adjustment)
        
        updated_data = {
            "belief_system": current_beliefs,
            "status": "active"
        }
        supabase.table("players").update(updated_data).eq("id", request.player_id).execute()

        print(f"INFO:     玩家 {request.player_id} 的信念已演化为: {current_beliefs}")
        return {"status": "success", "new_beliefs": current_beliefs}

    except Exception as e:
        print(f"错误:     更新玩家信念时出错 - {e}")
        raise HTTPException(status_code=500, detail="更新信念时数据库出错。")
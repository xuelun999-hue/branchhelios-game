import os
from openai import OpenAI

# --- 步骤 1: 明确地加载 .env 文件 ---
# 我们将手动加载，确保万无一失
from dotenv import load_dotenv
# 构造 .env 文件的绝对路径 (从当前文件位置往上走两层)
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
if os.path.exists(dotenv_path):
    print(f"INFO: 正在从 {dotenv_path} 加载 .env 文件...")
    load_dotenv(dotenv_path=dotenv_path)
else:
    print(f"警告: 在 {dotenv_path} 未找到 .env 文件。")

# --- 步骤 2: 读取并验证 API Key ---
api_key = os.environ.get("OPENAI_API_KEY")

if not api_key:
    print("\n\n错误: 未能读取到 OPENAI_API_KEY！")
    print("请确认您的 helios-game/.env 文件存在，并且里面有 OPENAI_API_KEY=sk-...")
    exit() # 如果没有 Key，直接退出程序

print(f"成功读取到 API Key: {api_key[:5]}...{api_key[-4:]}") # 只打印首尾，保护您的密钥

# --- 步骤 3: 初始化客户端并进行一次最简单的 API 调用 ---
print("正在初始化 DeepSeek client...")
try:
    client = OpenAI(
        api_key=api_key, # 我们将 Key 直接传递进去
        base_url="https://api.deepseek.com/v1"
    )

    print("客户端初始化成功！正在发送测试请求...")

    chat_completion = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "user", "content": "你好"},
        ]
    )

    print("\n\n--- API 调用成功！ ---")
    print(chat_completion.choices[0].message.content)
    print("-----------------------\n\n")

except Exception as e:
    print(f"\n\n--- API 调用失败！ ---")
    print(f"错误类型: {type(e).__name__}")
    print(f"错误详情: {e}")
    print("-----------------------\n\n")
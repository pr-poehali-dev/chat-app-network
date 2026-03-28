"""
Авторизация пользователей: регистрация, вход, выход, проверка сессии.
Действие передаётся в поле action тела запроса: register | login | logout | me
"""
import json
import os
import hashlib
import secrets
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p39338824_chat_app_network")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def generate_token() -> str:
    return secrets.token_hex(32)


def ok(data: dict) -> dict:
    return {"statusCode": 200, "headers": {**CORS, "Content-Type": "application/json"},
            "body": json.dumps(data)}


def err(code: int, message: str) -> dict:
    return {"statusCode": code, "headers": {**CORS, "Content-Type": "application/json"},
            "body": json.dumps({"error": message})}


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    action = body.get("action") or (event.get("queryStringParameters") or {}).get("action", "")

    # --- register ---
    if action == "register":
        username = (body.get("username") or "").strip().lower()
        display_name = (body.get("display_name") or "").strip()
        password = body.get("password") or ""

        if not username or not display_name or not password:
            return err(400, "Заполните все поля")
        if len(username) < 3:
            return err(400, "Логин минимум 3 символа")
        if len(password) < 6:
            return err(400, "Пароль минимум 6 символов")

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(f"SELECT id FROM {SCHEMA}.users WHERE username = '{username}'")
        if cur.fetchone():
            conn.close()
            return err(409, "Логин уже занят")

        pw_hash = hash_password(password)
        cur.execute(
            f"INSERT INTO {SCHEMA}.users (username, display_name, password_hash) "
            f"VALUES ('{username}', '{display_name}', '{pw_hash}') RETURNING id"
        )
        user_id = cur.fetchone()[0]
        token = generate_token()
        cur.execute(
            f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES ({user_id}, '{token}')"
        )
        conn.commit()
        conn.close()
        return ok({"token": token, "user": {"id": user_id, "username": username, "display_name": display_name}})

    # --- login ---
    if action == "login":
        username = (body.get("username") or "").strip().lower()
        password = body.get("password") or ""

        if not username or not password:
            return err(400, "Введите логин и пароль")

        pw_hash = hash_password(password)
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, username, display_name FROM {SCHEMA}.users "
            f"WHERE username = '{username}' AND password_hash = '{pw_hash}'"
        )
        row = cur.fetchone()
        if not row:
            conn.close()
            return err(401, "Неверный логин или пароль")

        user_id, uname, dname = row
        token = generate_token()
        cur.execute(f"INSERT INTO {SCHEMA}.sessions (user_id, token) VALUES ({user_id}, '{token}')")
        cur.execute(f"UPDATE {SCHEMA}.users SET is_online = TRUE, last_seen = NOW() WHERE id = {user_id}")
        conn.commit()
        conn.close()
        return ok({"token": token, "user": {"id": user_id, "username": uname, "display_name": dname}})

    # --- me ---
    if action == "me":
        token = body.get("token", "")
        if not token:
            return err(401, "Нет токена")

        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            f"SELECT u.id, u.username, u.display_name FROM {SCHEMA}.users u "
            f"JOIN {SCHEMA}.sessions s ON s.user_id = u.id "
            f"WHERE s.token = '{token}' AND s.expires_at > NOW()"
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return err(401, "Сессия истекла")
        return ok({"user": {"id": row[0], "username": row[1], "display_name": row[2]}})

    # --- logout ---
    if action == "logout":
        token = body.get("token", "")
        if token:
            conn = get_conn()
            cur = conn.cursor()
            cur.execute(
                f"SELECT u.id FROM {SCHEMA}.users u "
                f"JOIN {SCHEMA}.sessions s ON s.user_id = u.id WHERE s.token = '{token}'"
            )
            row = cur.fetchone()
            if row:
                cur.execute(f"UPDATE {SCHEMA}.users SET is_online = FALSE WHERE id = {row[0]}")
            cur.execute(f"UPDATE {SCHEMA}.sessions SET expires_at = NOW() WHERE token = '{token}'")
            conn.commit()
            conn.close()
        return ok({"ok": True})

    return err(400, "Неизвестное действие")

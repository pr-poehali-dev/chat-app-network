"""
Чат: отправка сообщений, получение истории, список пользователей, управление звонками.
Действия: send | messages | users | call_start | call_answer | call_end | call_status | poll
"""
import json
import os
import psycopg2

SCHEMA = os.environ.get("MAIN_DB_SCHEMA", "t_p39338824_chat_app_network")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def ok(data: dict) -> dict:
    return {"statusCode": 200, "headers": {**CORS, "Content-Type": "application/json"},
            "body": json.dumps(data, default=str)}


def err(code: int, message: str) -> dict:
    return {"statusCode": code, "headers": {**CORS, "Content-Type": "application/json"},
            "body": json.dumps({"error": message})}


def get_user_by_token(cur, token: str):
    cur.execute(
        f"SELECT u.id, u.username, u.display_name FROM {SCHEMA}.users u "
        f"JOIN {SCHEMA}.sessions s ON s.user_id = u.id "
        f"WHERE s.token = '{token}' AND s.expires_at > NOW()"
    )
    return cur.fetchone()


def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    body = {}
    if event.get("body"):
        body = json.loads(event["body"])

    action = body.get("action") or (event.get("queryStringParameters") or {}).get("action", "")
    token = body.get("token", "")

    conn = get_conn()
    cur = conn.cursor()

    me = get_user_by_token(cur, token)
    if not me:
        conn.close()
        return err(401, "Требуется авторизация")

    my_id, my_username, my_display_name = me

    # --- users: список всех пользователей кроме себя ---
    if action == "users":
        cur.execute(
            f"SELECT id, username, display_name, is_online, last_seen "
            f"FROM {SCHEMA}.users WHERE id != {my_id} ORDER BY display_name"
        )
        rows = cur.fetchall()
        conn.close()
        return ok({"users": [
            {"id": r[0], "username": r[1], "display_name": r[2],
             "is_online": r[3], "last_seen": str(r[4])}
            for r in rows
        ]})

    # --- send: отправить сообщение ---
    if action == "send":
        to_id = body.get("to_user_id")
        text = (body.get("text") or "").strip()
        if not to_id or not text:
            conn.close()
            return err(400, "Укажите получателя и текст")
        if len(text) > 4000:
            conn.close()
            return err(400, "Сообщение слишком длинное")

        cur.execute(
            f"INSERT INTO {SCHEMA}.messages (from_user_id, to_user_id, text) "
            f"VALUES ({my_id}, {int(to_id)}, $msg$" + text + f"$msg$) RETURNING id, created_at"
        )
        row = cur.fetchone()

        cur.execute(
            f"UPDATE {SCHEMA}.users SET last_seen = NOW(), is_online = TRUE WHERE id = {my_id}"
        )
        conn.commit()
        conn.close()
        return ok({"id": row[0], "created_at": str(row[1])})

    # --- messages: история переписки с пользователем ---
    if action == "messages":
        with_id = body.get("with_user_id")
        since_id = int(body.get("since_id") or 0)
        if not with_id:
            conn.close()
            return err(400, "Укажите собеседника")

        cur.execute(
            f"SELECT id, from_user_id, to_user_id, text, created_at, is_read "
            f"FROM {SCHEMA}.messages "
            f"WHERE ((from_user_id = {my_id} AND to_user_id = {int(with_id)}) "
            f"   OR (from_user_id = {int(with_id)} AND to_user_id = {my_id})) "
            f"AND id > {since_id} "
            f"ORDER BY id ASC LIMIT 100"
        )
        rows = cur.fetchall()

        # пометить входящие как прочитанные
        if rows:
            cur.execute(
                f"UPDATE {SCHEMA}.messages SET is_read = TRUE "
                f"WHERE to_user_id = {my_id} AND from_user_id = {int(with_id)} AND is_read = FALSE"
            )
            conn.commit()

        conn.close()
        return ok({"messages": [
            {"id": r[0], "from_user_id": r[1], "to_user_id": r[2],
             "text": r[3], "created_at": str(r[4]), "is_read": r[5]}
            for r in rows
        ]})

    # --- poll: опрос новых событий (новые сообщения + входящие звонки) ---
    if action == "poll":
        since_msg_id = int(body.get("since_msg_id") or 0)

        # новые входящие сообщения от всех
        cur.execute(
            f"SELECT m.id, m.from_user_id, m.text, m.created_at, u.display_name "
            f"FROM {SCHEMA}.messages m "
            f"JOIN {SCHEMA}.users u ON u.id = m.from_user_id "
            f"WHERE m.to_user_id = {my_id} AND m.id > {since_msg_id} "
            f"ORDER BY m.id ASC LIMIT 50"
        )
        new_msgs = [
            {"id": r[0], "from_user_id": r[1], "text": r[2],
             "created_at": str(r[3]), "from_display_name": r[4]}
            for r in cur.fetchall()
        ]

        # входящий активный звонок
        cur.execute(
            f"SELECT c.id, c.caller_id, u.display_name, c.status "
            f"FROM {SCHEMA}.calls c "
            f"JOIN {SCHEMA}.users u ON u.id = c.caller_id "
            f"WHERE c.callee_id = {my_id} AND c.status = 'ringing' "
            f"ORDER BY c.started_at DESC LIMIT 1"
        )
        r = cur.fetchone()
        incoming_call = {"id": r[0], "caller_id": r[1], "caller_name": r[2], "status": r[3]} if r else None

        # статус исходящего звонка
        cur.execute(
            f"SELECT c.id, c.callee_id, u.display_name, c.status "
            f"FROM {SCHEMA}.calls c "
            f"JOIN {SCHEMA}.users u ON u.id = c.callee_id "
            f"WHERE c.caller_id = {my_id} AND c.status IN ('ringing','active') "
            f"ORDER BY c.started_at DESC LIMIT 1"
        )
        r2 = cur.fetchone()
        outgoing_call = {"id": r2[0], "callee_id": r2[1], "callee_name": r2[2], "status": r2[3]} if r2 else None

        # обновить last_seen
        cur.execute(f"UPDATE {SCHEMA}.users SET last_seen = NOW(), is_online = TRUE WHERE id = {my_id}")
        conn.commit()
        conn.close()

        return ok({
            "new_messages": new_msgs,
            "incoming_call": incoming_call,
            "outgoing_call": outgoing_call,
        })

    # --- call_start: начать звонок ---
    if action == "call_start":
        to_id = body.get("to_user_id")
        if not to_id:
            conn.close()
            return err(400, "Укажите собеседника")

        # завершить все прошлые звонки
        cur.execute(
            f"UPDATE {SCHEMA}.calls SET status = 'ended', ended_at = NOW() "
            f"WHERE (caller_id = {my_id} OR callee_id = {my_id}) AND status IN ('ringing','active')"
        )
        cur.execute(
            f"INSERT INTO {SCHEMA}.calls (caller_id, callee_id, status) "
            f"VALUES ({my_id}, {int(to_id)}, 'ringing') RETURNING id"
        )
        call_id = cur.fetchone()[0]
        conn.commit()
        conn.close()
        return ok({"call_id": call_id})

    # --- call_answer: принять звонок ---
    if action == "call_answer":
        call_id = body.get("call_id")
        if not call_id:
            conn.close()
            return err(400, "Укажите call_id")
        cur.execute(
            f"UPDATE {SCHEMA}.calls SET status = 'active', answered_at = NOW() "
            f"WHERE id = {int(call_id)} AND callee_id = {my_id} AND status = 'ringing'"
        )
        conn.commit()
        conn.close()
        return ok({"ok": True})

    # --- call_end: завершить звонок ---
    if action == "call_end":
        call_id = body.get("call_id")
        if not call_id:
            # завершить все активные
            cur.execute(
                f"UPDATE {SCHEMA}.calls SET status = 'ended', ended_at = NOW() "
                f"WHERE (caller_id = {my_id} OR callee_id = {my_id}) AND status IN ('ringing','active')"
            )
        else:
            cur.execute(
                f"UPDATE {SCHEMA}.calls SET status = 'ended', ended_at = NOW() "
                f"WHERE id = {int(call_id)} AND (caller_id = {my_id} OR callee_id = {my_id})"
            )
        conn.commit()
        conn.close()
        return ok({"ok": True})

    conn.close()
    return err(400, "Неизвестное действие")

# Frontend Verification

## Autocomplete Immediate Submit

Manual verification steps:

1. In `backend`, initialize the DB: `.\.venv\Scripts\python.exe -m app.db.init_schema`
2. In `backend`, start the server: `.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
3. In `frontend`, start the server: `npm run dev`
4. Open `http://127.0.0.1:5173/`.
5. Type `요구` in the message input.
6. Click `요구사항 정의서 생성` in the autocomplete list.

Expected behavior:

- The clicked suggestion is submitted immediately without pressing Enter.
- The user message bubble shows the suggestion command.
- The input box is cleared, matching normal Enter/send-button submission UX.
- The agent response starts once.
- Rapid repeated clicks do not create duplicate user messages because `isSubmittingRef` and `isProcessing` guard submission.

Regression checks:

- Pressing Enter manually still submits the current input once.
- Clicking the send button manually still submits the current input once.
- While a request is processing, the input and send button are disabled and autocomplete suggestions are hidden.

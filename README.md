# Finpm Frontend

프론트엔드는 기본적으로 `http://127.0.0.1:8000`의 백엔드 API에 연결합니다.
다른 주소를 사용할 때는 `VITE_API_BASE_URL`을 설정합니다.

```powershell
cd ..\backend
.\.venv\Scripts\python.exe -m app.db.init_schema
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

다른 터미널에서 프론트엔드를 실행합니다.

```powershell
cd ..\frontend
npm run dev
```

브라우저에서 `http://127.0.0.1:5173/`을 엽니다.

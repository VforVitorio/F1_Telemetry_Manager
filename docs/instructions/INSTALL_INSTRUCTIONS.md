# 🚀 Voice Chat Backend - Installation Guide

Quick start guide for installing and verifying voice chat backend.

## ⚡ Quick Install (3 steps)

### Step 1: Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

**What gets installed:**

- ✅ Existing: FastAPI, numpy, pandas, fastf1 (no changes)
- ✅ New: Whisper, pyttsx3, pydub, soundfile, aiofiles

**Time**: ~2-5 minutes (first time downloads Whisper model)

### Step 2: Verify Installation

```bash
python verify_dependencies.py
```

**Expected**: All ✅ green checkmarks

**If errors**: See [Troubleshooting](#troubleshooting) below

### Step 3: Test Services

```bash
# Test TTS (generates audio file)
python services/voice/tts_service.py

# Test STT (loads Whisper model)
python services/voice/stt_service.py
```

## ✅ What to Expect

### After pip install:

```
✅ All existing dependencies remain unchanged
✅ numpy==1.26.4 (stays the same)
✅ pandas==2.2.0 (stays the same)
✅ fastf1==3.4.0 (stays the same)
✅ New voice dependencies added (compatible)
```

### After verify_dependencies.py:

```
🔍 F1 Telemetry Manager - Dependency Check
==================================================

📦 Core Dependencies:
  ✅ fastapi              v0.109.0
  ✅ numpy                v1.26.4
  ✅ pandas               v2.2.0
  ✅ fastf1               v3.4.0

🎤 Voice Dependencies:
  ✅ openai-whisper       v20231117
  ✅ pyttsx3              v2.90
  ✅ pydub                v0.25.1
  ✅ soundfile            v0.12.1
  ✅ aiofiles             v23.2.1

🎉 All dependencies installed successfully!
```

## 🔧 Troubleshooting

### Issue: "torch not found" or large download

**Cause**: Whisper needs PyTorch (~2GB)

**Solution** (faster CPU-only install):

```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install openai-whisper==20231117
```

### Issue: "ffmpeg not found"

**Cause**: pydub needs ffmpeg binary

**Windows**:

```bash
choco install ffmpeg
# OR
scoop install ffmpeg
```

**Mac**:

```bash
brew install ffmpeg
```

**Linux**:

```bash
sudo apt-get install ffmpeg
```

**Verify**:

```bash
ffmpeg -version
```

### Issue: pyttsx3 not working

**Windows**: Should work out of the box (uses SAPI)

**Mac**: Install pyobjc:

```bash
pip install pyobjc
```

**Linux**: Install espeak:

```bash
sudo apt-get install espeak
```

### Issue: Version conflicts

**Check**:

```bash
pip check
```

**Solution**: Use virtual environment:

```bash
python -m venv venv_f1
source venv_f1/bin/activate  # Linux/Mac
venv_f1\Scripts\activate     # Windows

pip install -r requirements.txt
```

## 📚 Documentation

- **Compatibility**: [DEPENDENCIES_COMPATIBILITY.md](DEPENDENCIES_COMPATIBILITY.md)
- **Setup Guide**: [VOICE_SETUP.md](VOICE_SETUP.md)
- **API Testing**: [test_voice_api.py](test_voice_api.py)

## 🎯 Next Steps (After Install)

### 1. Start Backend Server

```bash
uvicorn main:app --reload --port 8000
```

### 2. Test API Endpoints

```bash
python test_voice_api.py
```

### 3. View API Docs

http://localhost:8000/docs

## ✅ Compatibility Guarantee

All voice dependencies are **tested and compatible** with existing setup:

| Dependency     | Version  | Status          |
| -------------- | -------- | --------------- |
| numpy          | 1.26.4   | ✅ Unchanged    |
| pandas         | 2.2.0    | ✅ Unchanged    |
| fastf1         | 3.4.0    | ✅ Unchanged    |
| openai-whisper | 20231117 | ✅ Compatible   |
| pyttsx3        | 2.90     | ✅ No conflicts |
| pydub          | 0.25.1   | ✅ No conflicts |
| soundfile      | 0.12.1   | ✅ Compatible   |
| aiofiles       | 23.2.1   | ✅ No conflicts |

**Tested on**: Windows, Mac, Linux
**Python**: 3.10+

## 🆘 Need Help?

1. ✅ Check [DEPENDENCIES_COMPATIBILITY.md](DEPENDENCIES_COMPATIBILITY.md)
2. ✅ Run `python verify_dependencies.py`
3. ✅ Check [VOICE_SETUP.md](VOICE_SETUP.md) for detailed instructions

---

**Ready?** Run `pip install -r requirements.txt` and you're good to go! 🚀

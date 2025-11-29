"""
Quick test script for Voice API endpoints

Run this after starting the backend server to verify all endpoints work.
"""

import requests
import base64
import json
from pathlib import Path

BASE_URL = "http://localhost:8000/api/v1/voice"


def print_header(title: str):
    """Print formatted section header."""
    print("\n" + "=" * 60)
    print(f" {title}")
    print("=" * 60)


def test_health():
    """Test health check endpoint."""
    print_header("🏥 Testing Health Check")

    response = requests.get(f"{BASE_URL}/health")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")

    if response.status_code == 200:
        data = response.json()
        if data["status"] == "healthy":
            print("✅ Voice services are healthy!")
            return True
        else:
            print("⚠️ Voice services are degraded")
            return False
    else:
        print("❌ Health check failed")
        return False


def test_get_voices():
    """Test get available voices endpoint."""
    print_header("🎤 Testing Get Available Voices")

    response = requests.get(f"{BASE_URL}/voices")
    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"Found {data['count']} voices:")
        for i, voice in enumerate(data["voices"], 1):
            print(f"\n  {i}. {voice['name']}")
            print(f"     ID: {voice['id']}")
        print("\n✅ Voices retrieved successfully!")
        return True
    else:
        print("❌ Failed to get voices")
        return False


def test_tts():
    """Test text-to-speech endpoint."""
    print_header("Testing Text-to-Speech (TTS)")

    payload = {
        "text": "Hello, I am Caronte, your Formula 1 strategy assistant.",
        "rate": 175,
        "volume": 0.9
    }

    print(f"Synthesizing: '{payload['text']}'")

    response = requests.post(
        f"{BASE_URL}/synthesize",
        json=payload
    )

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        # Save audio to file
        output_file = "test_tts_output.wav"
        with open(output_file, "wb") as f:
            f.write(response.content)

        print(f"✅ Generated {len(response.content)} bytes of audio")
        print(f"   Saved to: {output_file}")
        print(f"   Play it: start {output_file} (Windows) or open {output_file} (Mac)")
        return True
    else:
        print(f"❌ TTS failed: {response.text}")
        return False


def test_stt():
    """Test speech-to-text endpoint (requires test audio file)."""
    print_header("🎤 Testing Speech-to-Text (STT)")

    # Check if test audio exists
    test_files = ["test_tts_output.wav", "test_audio.wav", "test.wav"]
    audio_file = None

    for filename in test_files:
        if Path(filename).exists():
            audio_file = filename
            break

    if not audio_file:
        print("⚠️ No test audio file found.")
        print(f"   Create one of: {', '.join(test_files)}")
        print("   Skipping STT test.")
        return False

    print(f"Using audio file: {audio_file}")

    with open(audio_file, "rb") as f:
        files = {"audio": (audio_file, f, "audio/wav")}
        response = requests.post(
            f"{BASE_URL}/transcribe",
            files=files
        )

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"\nTranscription Results:")
        print(f"  Text: {data['text']}")
        print(f"  Language: {data['language']}")
        print(f"  Duration: {data['duration']:.2f}s")
        print("\n✅ Transcription successful!")
        return True
    else:
        print(f"❌ STT failed: {response.text}")
        return False


def test_voice_chat():
    """Test full voice chat flow (requires test audio file)."""
    print_header("💬 Testing Full Voice Chat Flow")

    # Check if test audio exists
    test_files = ["test_tts_output.wav", "test_audio.wav", "test.wav"]
    audio_file = None

    for filename in test_files:
        if Path(filename).exists():
            audio_file = filename
            break

    if not audio_file:
        print("⚠️ No test audio file found.")
        print(f"   Create one of: {', '.join(test_files)}")
        print("   Skipping voice chat test.")
        return False

    print(f"Using audio file: {audio_file}")

    with open(audio_file, "rb") as f:
        files = {"audio": (audio_file, f, "audio/wav")}
        response = requests.post(
            f"{BASE_URL}/voice-chat",
            files=files
        )

    print(f"Status Code: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"\nVoice Chat Results:")
        print(f"  User said: {data['transcript']}")
        print(f"  Response: {data['response_text'][:100]}...")
        print(f"  Processing time: {data['processing_time']:.2f}s")

        # Decode and save response audio
        audio_bytes = base64.b64decode(data['audio_base64'])
        output_file = "test_voice_chat_response.wav"
        with open(output_file, "wb") as f:
            f.write(audio_bytes)

        print(f"\n💾 Response audio saved to: {output_file}")
        print(f"🎧 Play it: start {output_file} (Windows) or open {output_file} (Mac)")
        print("\n✅ Voice chat flow successful!")
        return True
    else:
        print(f"❌ Voice chat failed: {response.text}")
        return False


def main():
    """Run all tests."""
    print("🧪 Voice API Test Suite")
    print("=" * 60)
    print("Make sure the backend server is running:")
    print("  cd backend && uvicorn main:app --reload --port 8000")
    print()

    results = []

    # Run tests
    results.append(("Health Check", test_health()))
    results.append(("Get Voices", test_get_voices()))
    results.append(("TTS", test_tts()))
    results.append(("STT", test_stt()))
    results.append(("Voice Chat", test_voice_chat()))

    # Summary
    print_header("📊 Test Summary")
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {name}")

    passed_count = sum(1 for _, passed in results if passed)
    total = len(results)
    print(f"\nTotal: {passed_count}/{total} tests passed")

    if passed_count == total:
        print("\n🎉 All tests passed!")
    elif passed_count > 0:
        print("\n⚠️ Some tests failed")
    else:
        print("\n❌ All tests failed - check server status")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Tests interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")

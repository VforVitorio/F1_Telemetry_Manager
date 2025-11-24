"""
Quick dependency verification script

Checks if all dependencies are installed and compatible.
Run this after: pip install -r requirements.txt
"""

import sys
from importlib.metadata import version


def check_import(package_name, display_name=None):
    """Try to import a package and report status."""
    display = display_name or package_name
    try:
        __import__(package_name)
        try:
            ver = version(package_name)
            print(f"  ✅ {display:20} v{ver}")
            return True
        except:
            print(f"  ✅ {display:20} (installed)")
            return True
    except ImportError as e:
        print(f"  ❌ {display:20} NOT FOUND - {e}")
        return False
    except Exception as e:
        print(f"  ⚠️  {display:20} ERROR - {e}")
        return False


def main():
    print("=" * 60)
    print(" 🔍 F1 Telemetry Manager - Dependency Check")
    print("=" * 60)

    results = {
        "Core Dependencies": [],
        "Voice Dependencies": []
    }

    # Core Dependencies
    print("\n📦 Core Dependencies:")
    results["Core Dependencies"].append(check_import("fastapi"))
    results["Core Dependencies"].append(check_import("uvicorn"))
    results["Core Dependencies"].append(check_import("pydantic"))
    results["Core Dependencies"].append(check_import("numpy"))
    results["Core Dependencies"].append(check_import("pandas"))
    results["Core Dependencies"].append(check_import("fastf1"))

    # Voice Dependencies
    print("\n🎤 Voice Dependencies:")
    results["Voice Dependencies"].append(check_import("whisper", "openai-whisper"))
    results["Voice Dependencies"].append(check_import("pyttsx3"))
    results["Voice Dependencies"].append(check_import("pydub"))
    results["Voice Dependencies"].append(check_import("soundfile"))
    results["Voice Dependencies"].append(check_import("aiofiles"))

    # Version info for critical packages
    print("\n📊 Version Details:")
    try:
        import numpy as np
        import pandas as pd
        import whisper

        print(f"  numpy:  {np.__version__} (required: 1.26.4)")
        print(f"  pandas: {pd.__version__} (required: 2.2.0)")
        print(f"  whisper: {whisper.__version__ if hasattr(whisper, '__version__') else 'installed'}")
    except Exception as e:
        print(f"  ⚠️  Could not check versions: {e}")

    # Summary
    print("\n" + "=" * 60)
    print(" 📊 SUMMARY")
    print("=" * 60)

    for category, checks in results.items():
        passed = sum(checks)
        total = len(checks)
        status = "✅ PASS" if passed == total else "❌ FAIL"
        print(f"{status} {category}: {passed}/{total}")

    all_passed = all(all(checks) for checks in results.values())

    if all_passed:
        print("\n🎉 All dependencies installed successfully!")
        print("\n📋 Next steps:")
        print("  1. Start backend: uvicorn main:app --reload --port 8000")
        print("  2. Test services: python services/voice/tts_service.py")
        print("  3. Run API tests: python test_voice_api.py")
        return 0
    else:
        print("\n⚠️  Some dependencies are missing!")
        print("\n📋 To fix:")
        print("  pip install -r requirements.txt")
        return 1


if __name__ == "__main__":
    sys.exit(main())

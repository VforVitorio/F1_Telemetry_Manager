"""
Quick Test Script for Query Router

Tests the query routing system without starting the full FastAPI server.
"""

import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).resolve().parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from backend.services.chatbot.utils.query_classifier import QueryClassifier, QueryType


def test_classifier():
    """Test the query classifier with example queries."""
    print("=" * 60)
    print("TESTING QUERY CLASSIFIER")
    print("=" * 60)

    classifier = QueryClassifier()

    test_cases = [
        ("What is DRS?", QueryType.BASIC_QUERY),
        ("Explain the points system", QueryType.BASIC_QUERY),
        ("Show me the throttle data for lap 15", QueryType.TECHNICAL_QUERY),
        ("Analyze brake pressure in sector 2", QueryType.TECHNICAL_QUERY),
        ("Compare Hamilton vs Verstappen lap times", QueryType.COMPARISON_QUERY),
        ("Who was faster, Leclerc or Sainz?", QueryType.COMPARISON_QUERY),
        ("Generate a summary of our conversation", QueryType.REPORT_REQUEST),
        ("Create a report", QueryType.REPORT_REQUEST),
        ("Download the data as CSV", QueryType.DOWNLOAD_REQUEST),
        ("Export to JSON", QueryType.DOWNLOAD_REQUEST),
    ]

    print("\n📋 Testing Classification:\n")

    correct = 0
    total = len(test_cases)

    for query, expected_type in test_cases:
        print(f"Query: {query}")
        try:
            detected_type = classifier.classify(query)
            status = "✅" if detected_type == expected_type else "❌"
            print(f"Expected: {expected_type.value}")
            print(f"Detected: {detected_type.value} {status}")

            if detected_type == expected_type:
                correct += 1
        except Exception as e:
            print(f"Error: {e} ❌")

        print("-" * 60)

    print(f"\n📊 Results: {correct}/{total} correct ({correct/total*100:.1f}%)")


def test_fallback_classifier():
    """Test the fallback rule-based classifier."""
    print("\n" + "=" * 60)
    print("TESTING FALLBACK CLASSIFIER")
    print("=" * 60)

    classifier = QueryClassifier()

    test_queries = [
        "What is DRS?",
        "Show throttle data",
        "Compare Hamilton vs Verstappen",
        "Generate summary",
        "Download CSV",
    ]

    print("\n📋 Testing Fallback (Rule-based):\n")

    for query in test_queries:
        print(f"Query: {query}")
        result = classifier._fallback_classify(query)
        print(f"Fallback Result: {result.value}")
        print("-" * 60)


def test_router_structure():
    """Test that all router components are properly structured."""
    print("\n" + "=" * 60)
    print("TESTING ROUTER STRUCTURE")
    print("=" * 60)

    try:
        from backend.services.chatbot.router import QueryRouter

        print("\nAll imports successful\n")

        # Initialize router
        router = QueryRouter()
        print("QueryRouter initialized")

        # Check handlers
        print(f"Handlers registered: {len(router.handlers)}")

        for query_type, handler in router.handlers.items():
            print(f"  - {query_type.value}: {handler.__class__.__name__}")

        print("\nRouter structure is valid!")

    except Exception as e:
        print(f"\nError testing router structure: {e}")
        import traceback
        traceback.print_exc()


def main():
    """Run all tests."""
    print("\nStarting Query Router Tests\n")

    # Test 1: Router structure
    test_router_structure()

    # Test 2: Fallback classifier (doesn't require LM Studio)
    test_fallback_classifier()

    # Test 3: Full classifier (requires LM Studio)
    print("\n" + "=" * 60)
    print("FULL CLASSIFIER TEST")
    print("=" * 60)
    print("\nNote: This test requires LM Studio to be running.")
    print("If LM Studio is not available, it will use the fallback classifier.")

    response = input("\nDo you want to test with LM Studio? (y/n): ").strip().lower()

    if response == 'y':
        test_classifier()
    else:
        print("\nSkipping LM Studio test.")

    print("\n" + "=" * 60)
    print("ALL TESTS COMPLETED")
    print("=" * 60)


if __name__ == "__main__":
    main()

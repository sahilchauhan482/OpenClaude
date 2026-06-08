import json
import collections
import os

filepath = r"C:\Users\USER\.codex\sessions\2026\06\07\rollout-2026-06-07T14-23-45-019ea149-ad17-7e80-a0c1-9b44923d90df.jsonl"
size = os.path.getsize(filepath)
print(f"Total size: {size / 1024 / 1024:.2f} MB")

type_counts = collections.defaultdict(int)
type_sizes = collections.defaultdict(int)

with open(filepath, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            record_type = data.get("type", "unknown")
            if record_type == "response_item":
                # categorize response items more finely
                payload = data.get("payload", {})
                item_type = payload.get("type", "unknown_item")
                key = f"{record_type}:{item_type}"
            else:
                key = record_type

            type_counts[key] += 1
            type_sizes[key] += len(line)
        except Exception as e:
            print("Error parsing line:", e)
            break

print("Record types by count:")
for k, v in sorted(type_counts.items(), key=lambda x: x[1], reverse=True):
    print(f"  {k}: {v} (size: {type_sizes[k] / 1024 / 1024:.2f} MB)")

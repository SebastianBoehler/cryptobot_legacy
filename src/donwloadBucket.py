from google.cloud import storage
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

# Replace with your actual bucket name
bucket_name = "vectorstore_bucket_34"

# Replace with your Google Cloud project ID
project_id = "desktopassistant-423912"

# Create a Storage client
storage_client = storage.Client()  # Use default authentication

# Get the bucket
bucket = storage_client.bucket(bucket_name)


def process_blob(blob):
    """Deletes the blob and re-uploads it with the correct content type."""
    # Download the blob content
    blob_content = blob.download_as_string().decode("utf-8")

    # Create a JSON object with the content
    data = {"content": blob_content}

    # Construct the new blob name with .json extension
    new_blob_name = (
        blob.name.replace(".txt", ".json") if blob.name.endswith(".txt") else blob.name
    )

    # Delete the original blob
    blob.delete()

    # Upload the JSON data to the renamed blob with the correct content type
    new_blob = bucket.blob(new_blob_name)
    new_blob.upload_from_string(json.dumps(data), content_type="application/json")
    print(f"Uploaded blob as JSON: {new_blob_name}")


# Process all blobs in parallel
with ThreadPoolExecutor(max_workers=10) as executor:  # Adjust max_workers as needed
    futures = [executor.submit(process_blob, blob) for blob in bucket.list_blobs()]
    for future in as_completed(futures):
        try:
            future.result()
        except Exception as e:
            print(f"Error processing blob: {e}")

print(f"Processed all files in {bucket_name}")

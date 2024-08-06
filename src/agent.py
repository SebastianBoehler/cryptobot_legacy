import sys
import json
import tensorflow as tf
from tensorflow import keras

print("Starting agent...", file=sys.stderr)

# Example Deep Learning Model (MLP) - Using Input layer
model = keras.Sequential(
    [
        keras.Input(shape=(1,)),  # Input: Reward
        keras.layers.Dense(128, activation="relu"),
        keras.layers.Dense(64, activation="relu"),
        keras.layers.Dense(3),  # Output: 3 Strategy Parameters
    ]
)

model.compile(optimizer="adam", loss="mse")

# Placeholder for training data
training_data = []


def generate_parameters(reward):
    # Predict new parameters using the model
    reward = tf.convert_to_tensor([[reward]], dtype=tf.float32)
    new_parameters = model.predict(reward)
    print(f"Predict: {new_parameters}", file=sys.stderr)
    return new_parameters.tolist()


def handle_stdin():
    for line in sys.stdin:
        print(f"Data received: {line.strip()}", file=sys.stderr)


# Start the listener
# handle_stdin()

if __name__ == "__main__":
    print("Inside main", file=sys.stderr)

    # Main loop
    while True:
        print("Waiting for reward", file=sys.stderr)
        try:
            # Read reward from STDIN
            print("Check1", file=sys.stderr)
            # reward_json = sys.stdin.readline().strip()  # No need for this anymore
            # reward = float(reward_json)
            string = sys.stdin.readline().strip()
            reward_json = json.loads(string)
            reward = float(reward_json["reward"])

            print(f"Received reward: {reward_json}", file=sys.stderr)

            # Print to stderr (which is captured by Node.js)
            sys.stderr.write(f"Reward: {reward}\n")
            # sys.stderr.flush()

            # Train the model (if enough data is available)
            training_data.append((reward, generate_parameters(reward)))

            print(f"Training data: {training_data}", file=sys.stderr)

            if len(training_data) > 10:  # Example: Train after 10 data points
                X, y = zip(*training_data)
                model.fit(X, y, epochs=5)

            # Generate and send new parameters to STDOUT
            new_parameters = generate_parameters(reward)
            print(f"New parameters: {new_parameters}", file=sys.stderr)
            print(json.dumps(new_parameters), file=sys.stdout)
            # sys.stdout.write(json.dumps(new_parameters) + "\n")
            sys.stdout.flush()  # Ensure output is sent immediately

        except (EOFError, KeyboardInterrupt):
            print("Exiting", file=sys.stderr)
            break
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)

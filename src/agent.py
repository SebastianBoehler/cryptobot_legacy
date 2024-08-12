import tensorflow as tf
from tensorflow import keras
import numpy as np
import sys
import json
import time

# Define the number of parameters
num_parameters = 4

# Define the parameter ranges
parameter_ranges = [
    (2, 10),  # Range for "steps"
    (0.85, 1.1),  # Range for "multiplier"
    (-30, -10),  # Range for "stopLoss"
    (-30, -5),  # Range for "leverReduce"
]

# Define the model architecture
model = keras.Sequential(
    [
        keras.Input(shape=(1,)),  # Input: reward
        keras.layers.Dense(128, activation="relu"),
        keras.layers.Dense(64, activation="relu"),
        keras.layers.Dense(num_parameters),  # Output: predicted parameters
    ]
)

model.compile(optimizer="adam", loss="mse")

# Training data (initialize empty)
training_data = []


# Function to generate random parameters within specified ranges
def generate_random_parameters(parameter_ranges):
    parameters = []
    for range_min, range_max in parameter_ranges:
        parameters.append(np.random.uniform(range_min, range_max))
    return parameters


# Function to train the model
def train_model(training_data):
    print(f"Training model with {len(training_data)} data points", file=sys.stderr)
    if len(training_data) > 10:  # Example: Train after 10 data points
        X, y = zip(*training_data)
        # Correctly shape the y array
        y = np.array(y)  # Convert to NumPy array
        y = y.reshape(-1, num_parameters)  # Reshape to (number of data points, 4)
        history = model.fit(
            np.array(X), y, epochs=5, verbose=0
        )  # Suppress training output
        print("Model trained", file=sys.stderr)
        loss = history.history["loss"][-1]
        print(f"Loss: {loss}", file=sys.stderr)  # Log the loss value
        print(f"Loss: {loss}", file=sys.stdout)  # Send loss value to the optimizer
        return loss


# Main loop
def optimize_parameters(
    model, parameter_ranges, num_parameters, iterations=200, training_iterations=5
):
    losses = []
    for iteration in range(iterations):
        print(f"Iteration: {iteration}", file=sys.stderr)
        print("Generating initial parameters", file=sys.stderr)

        # Epsilon-Greedy Exploration
        epsilon = 0.9  # High exploration rate
        if iteration < training_iterations:
            parameters = generate_random_parameters(parameter_ranges)
            print("Using random parameters", file=sys.stderr)
        else:
            if np.random.rand() < epsilon:
                parameters = generate_random_parameters(parameter_ranges)
                print("Using random parameters", file=sys.stderr)
            else:
                # Predict parameters using reward as input
                predicted_parameters = model.predict(np.array([[reward]]))[
                    0
                ]  # Use reward as input
                parameters = predicted_parameters.tolist()
                print("Using predicted parameters", file=sys.stderr)
            print(f"Predicted parameters: {parameters}", file=sys.stderr)

        print("Outputing params", file=sys.stderr)
        print(
            json.dumps({"parameters": parameters}), file=sys.stdout
        )  # Output predicted parameters
        sys.stdout.flush()

        # Wait for reward from optimizer with timeout and retry loop
        start_time = time.time()
        timeout_seconds = 15  # Increased timeout to 15 seconds
        reward_data = None
        while True:
            print("Waiting for reward...", file=sys.stderr)
            try:
                # Wrap the readline in a try-except block
                reward_data = json.loads(sys.stdin.readline().strip())
                print("Reward received!", file=sys.stderr)
                # Update currentParameters from the received data
                currentParameters = reward_data[
                    "parameters"
                ]  # Get parameters from the JSON
                break  # Exit the loop if reward is received
            except json.JSONDecodeError:
                print("Invalid JSON input", file=sys.stderr)
                pass  # Ignore invalid JSON input
            except Exception as e:
                print(f"Error reading reward: {e}", file=sys.stderr)
                if time.time() - start_time > timeout_seconds:
                    print(
                        f"Timeout waiting for reward. Iteration {iteration} skipped.",
                        file=sys.stderr,
                    )
                    break  # Exit the loop if timeout occurs
                else:
                    continue  # Retry reading reward

        if reward_data is None:
            continue  # Skip to the next iteration if no reward is received

        reward = reward_data["reward"]

        print(f"Received reward: {reward}", file=sys.stderr)

        # Append data to training set
        training_data.append(
            (reward, currentParameters)
        )  # Use reward as input and parameters as output

        print("Training model", file=sys.stderr)
        # Train the model
        loss = train_model(training_data)
        if loss:
            losses.append(loss)

        # Print the best parameters and reward so far
        # Only attempt to find best parameters if training_data is not empty
        if training_data:
            best_params, best_reward = training_data[
                np.argmax([x[1] for x in training_data])
            ]
            print(
                f"Best Parameters: {best_params}, Best Reward: {best_reward}",
                file=sys.stdout,
            )


# Run the optimization process
optimize_parameters(model, parameter_ranges, num_parameters)

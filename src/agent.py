import tensorflow as tf
from tensorflow import keras
import numpy as np
import sys
import json
import time
import matplotlib.pyplot as plt
from collections import deque

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
    for i, (range_min, range_max) in enumerate(parameter_ranges):
        if i == 0:  # Assuming 'steps' is the first parameter
            parameters.append(np.random.randint(range_min, range_max + 1))
        else:
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
    initial_epsilon = 0.4
    epsilon_decay = 0.995  # Decay factor
    min_epsilon = 0.1  # Minimum epsilon value

    # Create a deque to store the last 1000 parameter-reward pairs
    history = deque(maxlen=1000)

    for iteration in range(iterations):
        print(f"Iteration: {iteration}")
        print("Generating initial parameters")

        # Calculate current epsilon
        epsilon = max(initial_epsilon * (epsilon_decay**iteration), min_epsilon)

        if iteration < training_iterations:
            parameters = generate_random_parameters(parameter_ranges)
            print(f"Using random parameters (Iteration: {iteration})")
        else:
            if np.random.rand() < epsilon:
                parameters = generate_random_parameters(parameter_ranges)
                print(f"Using random parameters (epsilon: {epsilon:.4f})")
            else:
                # Predict parameters using reward as input
                predicted_parameters = model.predict(np.array([[reward]]))[0]

                # Clip predicted parameters and round 'steps'
                parameters = []
                for i, (min_val, max_val) in enumerate(parameter_ranges):
                    if i == 0:  # Assuming 'steps' is the first parameter
                        clipped_value = int(
                            round(np.clip(predicted_parameters[i], min_val, max_val))
                        )
                    else:
                        clipped_value = np.clip(
                            predicted_parameters[i], min_val, max_val
                        )
                    parameters.append(clipped_value)

                print(f"Using predicted parameters (epsilon: {epsilon:.4f})")
            print(f"Parameters: {parameters}")

        print("Outputing params")
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
        currentParameters = reward_data["parameters"]

        # Clip received parameters to ensure they're within the specified ranges
        # and round 'steps' to the nearest integer
        currentParameters = [
            (
                round(np.clip(param, min_val, max_val))
                if i == 0
                else np.clip(param, min_val, max_val)
            )
            for i, (param, (min_val, max_val)) in enumerate(
                zip(currentParameters, parameter_ranges)
            )
        ]

        print(f"Received reward: {reward}", file=sys.stdout)

        # Append data to training set
        training_data.append(
            (reward, currentParameters)
        )  # Use reward as input and parameters as output

        print("Training model", file=sys.stdout)
        # Train the model
        loss = train_model(training_data)
        if loss:
            losses.append(loss)

        # After receiving the reward
        if reward_data is not None:
            reward = reward_data["reward"]
            currentParameters = reward_data["parameters"]

            # Clip and round parameters as before
            currentParameters = [
                (
                    round(np.clip(param, min_val, max_val))
                    if i == 0
                    else np.clip(param, min_val, max_val)
                )
                for i, (param, (min_val, max_val)) in enumerate(
                    zip(currentParameters, parameter_ranges)
                )
            ]

            # Add the parameter-reward pair to the history
            history.append((currentParameters, reward))

            # Every 50 iterations, plot the parameter-reward relationship
            if iteration % 5 == 0 and iteration > 0:
                plot_parameter_reward_relationship(history, parameter_ranges)

    # ... rest of the existing code ...


def plot_parameter_reward_relationship(history, parameter_ranges):
    parameters, rewards = zip(*history)
    parameters = np.array(parameters)
    rewards = np.array(rewards)

    fig, axs = plt.subplots(
        len(parameter_ranges), 1, figsize=(10, 5 * len(parameter_ranges))
    )

    for i, (param_name, (min_val, max_val)) in enumerate(
        zip(["steps", "multiplier", "stopLoss", "leverReduce"], parameter_ranges)
    ):
        axs[i].scatter(parameters[:, i], rewards, alpha=0.5)
        axs[i].set_xlabel(param_name)
        axs[i].set_ylabel("Reward")
        axs[i].set_title(f"{param_name} vs Reward")
        axs[i].set_xlim(min_val, max_val)

    plt.tight_layout()
    plt.savefig(f"parameter_reward_plot.png")
    plt.close()

    print(
        f"Parameter-reward plot saved as parameter_reward_plot.png",
    )


# Run the optimization process
optimize_parameters(model, parameter_ranges, num_parameters)

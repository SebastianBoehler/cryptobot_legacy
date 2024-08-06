import sys
import json
import numpy as np
import gymnasium as gym
from gymnasium import spaces
from tensorflow import keras
from keras.models import Sequential
from keras.layers import Dense
from keras.optimizers import Adam
from collections import deque
import random
import pickle

MEMORY_FILE = "old_agent_memory"  # Removed ".pkl" from the file name

# Create a global instance of the DQNAgent
agent = None


class DQNAgent:
    def __init__(self, state_size, action_space):
        global agent
        if agent is None:
            self.state_size = state_size
            self.action_space = action_space
            self.memory = deque(maxlen=200)
            self.gamma = 0.95
            # Increase initial epsilon
            self.epsilon = 0.8
            self.epsilon_min = 0.01
            # Slower decay
            self.epsilon_decay = 0.999
            self.learning_rate = 0.0001
            self.model = self._build_model()
            self.metrics = {"loss": [], "epsilon": [], "reward": []}
            agent = self
        else:
            # Use the existing agent instance
            pass

    def _build_model(self):
        model = Sequential()
        model.add(Dense(24, input_dim=self.state_size, activation="relu"))
        model.add(Dense(24, activation="relu"))
        model.add(Dense(len(self.action_space), activation="linear"))
        model.compile(loss="mse", optimizer=Adam(learning_rate=self.learning_rate))
        return model

    def remember(self, state, action, reward, next_state, done):
        global agent
        agent.memory.append((state, action, reward, next_state, done))
        print(f"Memory length: {len(agent.memory)}")
        # Update the agent's internal state
        agent.state = state

    def act(self, state):
        global agent
        print(f"State: {state}")
        if np.random.rand() <= agent.epsilon:
            action = []
            for param_name, (low, high) in agent.action_space.items():
                if isinstance(low, float) or isinstance(high, float):
                    action.append(round(np.random.uniform(low, high), 2))
                else:
                    action.append(int(np.random.uniform(low, high + 1)))
            print(f"Selected action (random): {action}")
            return np.array(action)
        else:
            act_values = agent.model.predict(state)
            action = []
            # Update parameters based on model prediction
            # Fix:  Directly assign updated parameters
            for i, (param_name, (low, high)) in enumerate(agent.action_space.items()):
                val = act_values[0][i]
                print(f"Parameter: {param_name}, Value: {val}")  # Debug print
                if isinstance(low, float) or isinstance(high, float):
                    agent.action_space[param_name] = (
                        low,
                        max(min(round(val, 2), high), low),
                    )  # Update action_space
                    action.append(max(min(round(val, 2), high), low))
                else:
                    agent.action_space[param_name] = (
                        low,
                        max(min(round(val), high), low),
                    )  # Update action_space
                    action.append(int(max(min(round(val), high), low)))
            print(f"Selected action (model): {action}")
            return np.array(action)

    def replay(self, batch_size):
        global agent
        print(f"Replaying with batch size: {batch_size}")
        minibatch = random.sample(agent.memory, batch_size)
        for state, action, reward, next_state, done in minibatch:
            target = reward
            if not done:
                target = reward + agent.gamma * np.amax(
                    agent.model.predict(next_state)[0]
                )
            target_f = agent.model.predict(state)
            target_f[0] = target
            history = agent.model.fit(state, target_f, epochs=32, verbose=0)
            loss = history.history["loss"][0]
            agent.metrics["loss"].append(loss)
            agent.metrics["epsilon"].append(agent.epsilon)
            agent.metrics["reward"].append(reward)
            print(f"Loss: {loss}, Epsilon: {agent.epsilon}")
            # Update epsilon here
            if agent.epsilon > agent.epsilon_min:
                agent.epsilon *= agent.epsilon_decay

    def load(self, name):
        global agent
        print(f"Loading weights from: {name}")
        agent.model.load_weights(name + ".weights.h5")  # Load weights from .h5 file

    def save(self, name):
        global agent
        print(f"Saving weights to: {name}")
        agent.model.save_weights(name + ".weights.h5")  # Save weights in .h5 format


class TradingEnv(gym.Env):
    def __init__(self):
        super(TradingEnv, self).__init__()
        self.action_space = {
            "steps": (2, 10),
            "multiplier": (0.85, 1.1),
            "stopLoss": (-30, -10),
            "leverReduce": (-30, -5),
        }
        self.observation_space = spaces.Box(low=0, high=1, shape=(5,), dtype=np.float32)

    def step(self, action):
        # Placeholder - adapt based on your strategy
        next_state = self.observation_space.sample()
        reward = np.random.randn()
        done = False
        return next_state, reward, done, False, {}

    def reset(self, seed=None):
        super().reset(seed=seed)
        return self.observation_space.sample(), {}


# Initialize environment and agent
env = TradingEnv()
state_size = env.observation_space.shape[0]
agent = DQNAgent(state_size, env.action_space)

# Load agent's memory
try:
    with open(MEMORY_FILE + ".pkl", "rb") as f:  # Added ".pkl" back for loading
        agent.memory = pickle.load(f)
        # Load weights from file
        agent.load(MEMORY_FILE)  # This line should load the weights
except FileNotFoundError:
    pass

if __name__ == "__main__":
    action = None
    loss = None  # Initialize loss

    # Always return a JSON object, even if no input arguments are provided
    action_dict = {}
    if len(sys.argv) > 1:
        results = json.loads(sys.argv[1])
        reward = results.get("reward", 0)
        state = np.array(results.get("state", [0, 0, 0, 0, 0])).reshape(
            1, state_size
        )  # Load state from results
        next_state = np.array(
            results.get("next_state", env.observation_space.sample())
        ).reshape(1, state_size)
        action = [
            results.get("steps", 5),
            results.get("multiplier", 1.0),
            results.get("stopLoss", -15),
            results.get("leverReduce", -15),
        ]
        action = np.array(action)
        done = results.get("done", False)

        # Call remember function after receiving the reward and state
        agent.remember(state, action, reward, next_state, done)

        if len(agent.memory) > 16:
            agent.replay(16)
            loss = (
                agent.metrics["loss"][-1] if agent.metrics["loss"] else None
            )  # Get last loss

        action_dict = {}
        for i, param_name in enumerate(env.action_space):
            action_dict[param_name] = action[i]

        action_dict["loss"] = loss  # Add loss to output
        action_dict["state"] = next_state.tolist()  # Send updated state back
    else:
        # Get initial parameters
        state, _ = env.reset()
        state = np.reshape(state, [1, state_size])
        action = agent.act(state)
        action_dict = {}
        for i, param_name in enumerate(env.action_space):
            action_dict[param_name] = action[i]

    # Save weights to file
    agent.save(MEMORY_FILE)  # This line should save the weights

    print(json.dumps(action_dict))

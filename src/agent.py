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

MEMORY_FILE = "agent_memory.pkl"


class DQNAgent:
    def __init__(self, state_size, action_space):
        self.state_size = state_size
        self.action_space = action_space
        self.memory = deque(maxlen=2000)
        self.gamma = 0.95
        self.epsilon = 1.0
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.learning_rate = 0.001
        self.model = self._build_model()
        self.metrics = {"loss": [], "epsilon": [], "reward": []}

    def _build_model(self):
        model = Sequential()
        model.add(Dense(24, input_dim=self.state_size, activation="relu"))
        model.add(Dense(24, activation="relu"))
        model.add(Dense(len(self.action_space), activation="linear"))
        model.compile(loss="mse", optimizer=Adam(learning_rate=self.learning_rate))
        return model

    def remember(self, state, action, reward, next_state, done):
        self.memory.append((state, action, reward, next_state, done))

    def act(self, state):
        if np.random.rand() <= self.epsilon:
            action = []
            for param_name, (low, high) in self.action_space.items():
                if isinstance(low, float) or isinstance(high, float):
                    action.append(round(np.random.uniform(low, high), 2))
                else:
                    action.append(int(np.random.uniform(low, high + 1)))
            return np.array(action)
        else:
            act_values = self.model.predict(state)
            action = []
            for i, (param_name, (low, high)) in enumerate(self.action_space.items()):
                val = act_values[0][i]
                if isinstance(low, float) or isinstance(high, float):
                    action.append(max(min(round(val, 2), high), low))
                else:
                    action.append(int(max(min(round(val), high), low)))
            return np.array(action)

    def replay(self, batch_size):
        print(f"Replaying with batch size: {batch_size}")
        minibatch = random.sample(self.memory, batch_size)
        for state, action, reward, next_state, done in minibatch:
            target = reward
            if not done:
                target = reward + self.gamma * np.amax(
                    self.model.predict(next_state)[0]
                )
            target_f = self.model.predict(state)
            target_f[0] = target
            history = self.model.fit(state, target_f, epochs=32, verbose=0)
            loss = history.history["loss"][0]
            self.metrics["loss"].append(loss)
            self.metrics["epsilon"].append(self.epsilon)
            self.metrics["reward"].append(reward)
            print(f"Loss: {loss}, Epsilon: {self.epsilon}")
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def load(self, name):
        self.model.load_weights(name)

    def save(self, name):
        self.model.save_weights(name)


class TradingEnv(gym.Env):
    def __init__(self):
        super(TradingEnv, self).__init__()
        self.action_space = {
            "steps": (2, 10),
            "stopLoss": (-30, -10),
            "leverReduce": (-30, -5),
            "takeProfitRate": (1.01, 1.10),
            "takeProfitThreshold": (20, 80),
            "buyLowRate": (0.90, 0.99),
        }
        self.observation_space = spaces.Box(low=0, high=1, shape=(3,), dtype=np.float32)

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
    with open(MEMORY_FILE, "rb") as f:
        agent.memory = pickle.load(f)
except FileNotFoundError:
    pass

if __name__ == "__main__":
    action = None
    loss = None  # Initialize loss

    if len(sys.argv) > 1:
        results = json.loads(sys.argv[1])
        reward = results["reward"]
        state = np.array(results.get("state", env.observation_space.sample())).reshape(
            1, state_size
        )
        next_state = np.array(
            results.get("next_state", env.observation_space.sample())
        ).reshape(1, state_size)
        action = [
            results.get("steps", 5),
            results.get("multiplier", 1.0),
            results.get("stopLoss", -15),
            results.get("leverReduce", -15),
            results.get("takeProfitRate", 1.02),
            results.get("takeProfitThreshold", 50),
            results.get("buyLowRate", 0.975),
        ]
        action = np.array(action)
        done = results.get("done", False)

        agent.remember(state, action, reward, next_state, done)

    print(f"Memory length: {len(agent.memory)}")
    if len(agent.memory) > 32:
        agent.replay(32)
        loss = (
            agent.metrics["loss"][-1] if agent.metrics["loss"] else None
        )  # Get last loss

    if action is None:
        state, _ = env.reset()
        state = np.reshape(state, [1, state_size])
        action = agent.act(state)

    with open(MEMORY_FILE, "wb") as f:
        pickle.dump(agent.memory, f)

    action_dict = {}
    for i, param_name in enumerate(env.action_space):
        action_dict[param_name] = action[i]

    action_dict["loss"] = loss  # Add loss to output

    print(json.dumps(action_dict))

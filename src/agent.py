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

MEMORY_FILE = "agent_memory.pkl"  # File to store agent's memory


class DQNAgent:
    def __init__(self, state_size, action_space):
        self.state_size = state_size
        self.action_space = action_space
        self.memory = deque(maxlen=2000)  # Initialize memory as a deque
        self.gamma = 0.95  # Discount rate
        self.epsilon = 1.0  # Exploration rate
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.learning_rate = 0.001
        self.model = self._build_model()
        self.metrics = {"loss": [], "epsilon": [], "reward": []}

    def _build_model(self):
        model = Sequential()
        model.add(Dense(24, input_dim=self.state_size, activation="relu"))
        model.add(Dense(24, activation="relu"))
        model.add(Dense(6, activation="linear"))  # Output 6 values
        model.compile(loss="mse", optimizer=Adam(learning_rate=self.learning_rate))
        return model

    def remember(self, state, action, reward, next_state, done):
        self.memory.append((state, action, reward, next_state, done))

    def act(self, state):
        if np.random.rand() <= self.epsilon:
            # Explore
            steps = np.random.randint(
                self.action_space["steps"][0], self.action_space["steps"][1] + 1
            )
            stop_loss = int(
                np.random.uniform(
                    self.action_space["stopLoss"][0], self.action_space["stopLoss"][1]
                )
            )
            lever_reduce = int(
                np.random.uniform(
                    self.action_space["leverReduce"][0],
                    self.action_space["leverReduce"][1],
                )
            )
            take_profit_rate = round(
                np.random.uniform(
                    self.action_space["takeProfitRate"][0],
                    self.action_space["takeProfitRate"][1],
                ),
                2,
            )
            take_profit_threshold = int(
                np.random.uniform(
                    self.action_space["takeProfitThreshold"][0],
                    self.action_space["takeProfitThreshold"][1] + 1,
                )
            )
            buy_low_rate = round(
                np.random.uniform(
                    self.action_space["buyLowRate"][0],
                    self.action_space["buyLowRate"][1],
                ),
                2,
            )
            return np.array(
                [
                    steps,
                    stop_loss,
                    lever_reduce,
                    take_profit_rate,
                    take_profit_threshold,
                    buy_low_rate,
                ]
            )
        else:
            # Exploit
            act_values = self.model.predict(state)
            steps = int(
                max(
                    min(round(act_values[0][0]), self.action_space["steps"][1]),
                    self.action_space["steps"][0],
                )
            )
            stop_loss = int(
                max(
                    min(act_values[0][1], self.action_space["stopLoss"][1]),
                    self.action_space["stopLoss"][0],
                )
            )
            lever_reduce = int(
                max(
                    min(round(act_values[0][2]), self.action_space["leverReduce"][1]),
                    self.action_space["leverReduce"][0],
                )
            )
            take_profit_rate = round(
                max(
                    min(act_values[0][3], self.action_space["takeProfitRate"][1]),
                    self.action_space["takeProfitRate"][0],
                ),
                2,
            )
            take_profit_threshold = int(
                max(
                    min(
                        round(act_values[0][4]),
                        self.action_space["takeProfitThreshold"][1],
                    ),
                    self.action_space["takeProfitThreshold"][0],
                )
            )
            buy_low_rate = round(
                max(
                    min(act_values[0][5], self.action_space["buyLowRate"][1]),
                    self.action_space["buyLowRate"][0],
                ),
                2,
            )
            return np.array(
                [
                    steps,
                    stop_loss,
                    lever_reduce,
                    take_profit_rate,
                    take_profit_threshold,
                    buy_low_rate,
                ]
            )

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
        # Placeholder implementation
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
    pass  # Start with an empty memory if the file doesn't exist

if __name__ == "__main__":
    action = None  # Define action here, initially as None

    if len(sys.argv) > 1:
        # We received results, update the model
        results = json.loads(sys.argv[1])
        reward = results["reward"]
        state = np.array(results.get("state", env.observation_space.sample())).reshape(
            1, state_size
        )
        next_state = np.array(
            results.get("next_state", env.observation_space.sample())
        ).reshape(1, state_size)
        action = np.array(
            [
                results.get("steps", 1),
                results.get("stopLoss", -20),
                results.get("leverReduce", -10),
                results.get("takeProfitRate", 1.02),
                results.get("takeProfitThreshold", 50),
                results.get("buyLowRate", 0.975),
            ]
        )
        done = results.get("done", False)

        agent.remember(state, action, reward, next_state, done)

    # Replay experiences if there are enough in memory
    print(f"Memory length: {len(agent.memory)}")
    if len(agent.memory) > 32:
        agent.replay(32)

    # No results received, return new parameters
    if action is None:  # Only execute if action was not set in the previous block
        state, _ = env.reset()
        state = np.reshape(state, [1, state_size])
        action = agent.act(state)

    # Save the updated memory to the file
    with open(MEMORY_FILE, "wb") as f:
        pickle.dump(agent.memory, f)

    # Now action is accessible here
    print(
        json.dumps(
            {
                "steps": int(action[0]),  # This line should now work
                "stopLoss": float(action[1]),
                "leverReduce": int(action[2]),
                "takeProfitRate": float(action[3]),
                "takeProfitThreshold": int(action[4]),
                "buyLowRate": float(action[5]),
                "loss": agent.metrics["loss"][-1] if agent.metrics["loss"] else None,
            }
        )
    )

# Save the model after training (optional)
agent.save("trading_model.weights.h5")

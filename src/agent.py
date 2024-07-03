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


class DQNAgent:
    def __init__(self, state_size, action_space):
        self.state_size = state_size
        self.action_space = action_space
        self.memory = deque(maxlen=2000)
        self.gamma = 0.95  # discount rate
        self.epsilon = 1.0  # exploration rate
        self.epsilon_min = 0.01
        self.epsilon_decay = 0.995
        self.learning_rate = 0.001
        self.model = self._build_model()

    def _build_model(self):
        model = Sequential()
        model.add(Dense(24, input_dim=self.state_size, activation="relu"))
        model.add(Dense(24, activation="relu"))
        model.add(
            Dense(3, activation="linear")
        )  # Output 3 values for steps, multiplier, stopLoss
        model.compile(loss="mse", optimizer=Adam(learning_rate=self.learning_rate))
        return model

    def remember(self, state, action, reward, next_state, done):
        self.memory.append((state, action, reward, next_state, done))

    def act(self, state):
        if np.random.rand() <= self.epsilon:
            # Explore: Return random actions within defined spaces
            steps = np.random.randint(
                self.action_space["steps"][0], self.action_space["steps"][1] + 1
            )
            multiplier = round(
                np.random.uniform(
                    self.action_space["multiplier"][0],
                    self.action_space["multiplier"][1],
                ),
                2,
            )  # Limit to 2 decimal places
            stop_loss = int(
                np.random.uniform(
                    self.action_space["stopLoss"][0], self.action_space["stopLoss"][1]
                )
            )  # Ensure integer
            return np.array([steps, multiplier, stop_loss])
        else:
            # Exploit: Predict actions using the learned model
            act_values = self.model.predict(state)
            # Ensure actions are within the defined spaces and have correct decimal places
            steps = int(
                max(
                    min(round(act_values[0][0]), self.action_space["steps"][1]),
                    self.action_space["steps"][0],
                )
            )  # Ensure integer
            multiplier = round(
                max(
                    min(act_values[0][1], self.action_space["multiplier"][1]),
                    self.action_space["multiplier"][0],
                ),
                2,
            )  # Limit to 2 decimal places
            stop_loss = int(
                max(
                    min(act_values[0][2], self.action_space["stopLoss"][1]),
                    self.action_space["stopLoss"][0],
                )
            )  # Ensure integer
            return np.array([steps, multiplier, stop_loss])

    def replay(self, batch_size):
        minibatch = random.sample(self.memory, batch_size)
        for state, action, reward, next_state, done in minibatch:
            target = reward
            if not done:
                target = reward + self.gamma * np.amax(
                    self.model.predict(next_state)[0]
                )
            target_f = self.model.predict(state)
            target_f[0] = target  # Update the entire output layer
            self.model.fit(state, target_f, epochs=1, verbose=0)
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay

    def load(self, name):
        print("Loading model from", name)
        self.model.load_weights(name)

    def save(self, name):
        self.model.save_weights(name)


class TradingEnv(gym.Env):
    def __init__(self):
        super(TradingEnv, self).__init__()
        # Define action space for 'steps', 'multiplier', and 'stopLoss'
        self.action_space = {
            "steps": (2, 10),  # Example: steps between 1 and 10
            "multiplier": (0.8, 1.2),  # Example: multiplier between 0.7 and 1.3
            "stopLoss": (-30, -10),  # Stop loss between -80% and -10%
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


env = TradingEnv()
state_size = env.observation_space.shape[0]
agent = DQNAgent(state_size, env.action_space)  # Pass the action space to the agent

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
            results.get("multiplier", 1.0),
            results.get("stopLoss", -20),
        ]
    )  # Get steps, multiplier, and stopLoss
    done = results.get("done", False)

    agent.remember(state, action, reward, next_state, done)
    if len(agent.memory) > 32:
        agent.replay(32)
    print("1", json.dumps({"message": "Model updated"}))
else:
    # No results received, return new parameters
    state, _ = env.reset()
    state = np.reshape(state, [1, state_size])
    action = agent.act(state)
    print(
        json.dumps(
            {
                "steps": int(action[0]),  # Return steps as integer
                "multiplier": float(action[1]),  # Return multiplier as float
                "stopLoss": float(action[2]),  # Return stopLoss as float
            }
        )
    )

# Save the model after training
agent.save("trading_model.weights.h5")

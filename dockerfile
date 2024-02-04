# Dockerfile
# docker build -t sebastianboehler/cryptobot .
# Use an official Node runtime as the base image

FROM node:20.9.0

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install any needed packages specified in package.json
RUN yarn install 

# Set environment variables
ENV MONGO_URL=mongodb://localhost:27017/

# Copy the rest of the code to the working directory
COPY . .

# Build the project
RUN yarn build

# Run the app when the container launches
CMD ["yarn", "run", "trader"]

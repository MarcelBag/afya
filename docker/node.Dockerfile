# Use an official Node runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Move to backend directory where server.js resides
WORKDIR /app/backend

# Make port 4000 available
EXPOSE 4000

# Run the server
CMD ["node", "server.js"]

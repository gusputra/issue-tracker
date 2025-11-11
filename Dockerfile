# Gunakan image Node.js ringan
FROM node:18-alpine

# Buat folder kerja
WORKDIR /app

# Salin file dependency
COPY package*.json ./

# Install dependency production
RUN npm install --production

# Salin semua file project
COPY . .

# Expose port yang akan digunakan Fly.io
EXPOSE 8080

# Jalankan aplikasi
CMD ["npm", "start"]

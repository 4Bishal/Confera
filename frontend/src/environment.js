const isLocalhost = window.location.hostname === "localhost";

const server = isLocalhost
    ? "http://localhost:8000"
    : "https://conferabackend-yhu8.onrender.com";

export default server;

// Game client for Mini MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = new Image();
        this.worldSize = 2048; // World map is 2048x2048 pixels
        
        // Game state
        this.myPlayerId = null;
        this.players = {};
        this.avatars = {};
        this.ws = null;
        
        // Camera/viewport
        this.cameraX = 0;
        this.cameraY = 0;
        
        // Avatar image cache
        this.avatarImages = {};
        
        // Movement state
        this.keysPressed = {};
        this.movementInterval = null;
        
        this.init();
    }
    
    init() {
        // Set canvas size to fill the browser window
        this.resizeCanvas();
        
        // Load the world map image
        this.worldImage.onload = () => {
            this.draw();
        };
        this.worldImage.src = 'world.jpg';
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            this.draw();
        });
        
        // Connect to game server
        this.connectToServer();
        
        // Setup keyboard controls
        this.setupKeyboardControls();
    }
    
    connectToServer() {
        this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
        
        this.ws.onopen = () => {
            console.log('Connected to game server');
            this.joinGame();
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from game server');
        };
    }
    
    setupKeyboardControls() {
        // Handle key down events
        document.addEventListener('keydown', (event) => {
            if (this.keysPressed[event.code]) return; // Already pressed
            
            this.keysPressed[event.code] = true;
            
            // Map arrow keys to directions
            const directionMap = {
                'ArrowUp': 'up',
                'ArrowDown': 'down',
                'ArrowLeft': 'left',
                'ArrowRight': 'right'
            };
            
            const direction = directionMap[event.code];
            if (direction) {
                event.preventDefault(); // Prevent page scrolling
                this.sendMoveCommand(direction);
                this.startContinuousMovement();
            }
        });
        
        // Handle key up events
        document.addEventListener('keyup', (event) => {
            const directionMap = {
                'ArrowUp': 'up',
                'ArrowDown': 'down',
                'ArrowLeft': 'left',
                'ArrowRight': 'right'
            };
            
            const direction = directionMap[event.code];
            if (direction) {
                delete this.keysPressed[event.code];
                this.checkStopMovement();
            }
        });
    }
    
    sendMoveCommand(direction) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const message = {
            action: 'move',
            direction: direction
        };
        this.ws.send(JSON.stringify(message));
    }
    
    sendStopCommand() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const message = {
            action: 'stop'
        };
        this.ws.send(JSON.stringify(message));
    }
    
    startContinuousMovement() {
        if (this.movementInterval) return; // Already running
        
        this.movementInterval = setInterval(() => {
            // Send move command for any currently pressed keys
            Object.keys(this.keysPressed).forEach(keyCode => {
                const directionMap = {
                    'ArrowUp': 'up',
                    'ArrowDown': 'down',
                    'ArrowLeft': 'left',
                    'ArrowRight': 'right'
                };
                
                const direction = directionMap[keyCode];
                if (direction) {
                    this.sendMoveCommand(direction);
                }
            });
        }, 100); // Send move command every 100ms for continuous movement
    }
    
    checkStopMovement() {
        // Check if any movement keys are still pressed
        const hasMovementKeys = Object.keys(this.keysPressed).some(keyCode => {
            return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(keyCode);
        });
        
        if (!hasMovementKeys) {
            this.stopContinuousMovement();
            this.sendStopCommand();
        }
    }
    
    stopContinuousMovement() {
        if (this.movementInterval) {
            clearInterval(this.movementInterval);
            this.movementInterval = null;
        }
    }
    
    joinGame() {
        const message = {
            action: 'join_game',
            username: 'Summer'
        };
        this.ws.send(JSON.stringify(message));
    }
    
    handleServerMessage(data) {
        console.log('Server message:', data);
        
        // Debug: Log player count changes
        if (data.action === 'join_game' && data.success) {
            console.log(`Joined game! Total players: ${Object.keys(data.players).length}`);
        } else if (data.action === 'player_joined') {
            console.log(`Player joined: ${data.player.username}. Total players: ${Object.keys(this.players).length + 1}`);
        } else if (data.action === 'player_left') {
            console.log(`Player left. Total players: ${Object.keys(this.players).length - 1}`);
        } else if (data.action === 'players_moved') {
            console.log(`Players moved: ${Object.keys(data.players).length} players updated`);
        }
        
        switch (data.action) {
            case 'join_game':
                if (data.success) {
                    this.myPlayerId = data.playerId;
                    this.players = data.players;
                    this.avatars = data.avatars;
                    this.preloadAvatarImages();
                    this.updateCamera();
                    this.draw();
                } else {
                    console.error('Join game failed:', data.error);
                }
                break;
                
            case 'players_moved':
                // Update player positions
                Object.assign(this.players, data.players);
                this.updateCamera();
                this.draw();
                break;
                
            case 'player_joined':
                this.players[data.player.id] = data.player;
                this.avatars[data.avatar.name] = data.avatar;
                this.preloadAvatarImages();
                this.draw();
                break;
                
            case 'player_left':
                delete this.players[data.playerId];
                this.draw();
                break;
        }
    }
    
    updateCamera() {
        if (!this.myPlayerId || !this.players[this.myPlayerId]) return;
        
        const myPlayer = this.players[this.myPlayerId];
        
        // Center camera on my avatar
        this.cameraX = myPlayer.x - this.canvas.width / 2;
        this.cameraY = myPlayer.y - this.canvas.height / 2;
        
        // Clamp camera to world bounds
        this.cameraX = Math.max(0, Math.min(this.cameraX, this.worldSize - this.canvas.width));
        this.cameraY = Math.max(0, Math.min(this.cameraY, this.worldSize - this.canvas.height));
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.updateCamera();
    }
    
    worldToScreen(worldX, worldY) {
        return {
            x: worldX - this.cameraX,
            y: worldY - this.cameraY
        };
    }
    
    isVisible(worldX, worldY, width = 0, height = 0) {
        const screen = this.worldToScreen(worldX, worldY);
        return screen.x + width >= 0 && 
               screen.x <= this.canvas.width && 
               screen.y + height >= 0 && 
               screen.y <= this.canvas.height;
    }
    
    preloadAvatarImages() {
        Object.values(this.avatars).forEach(avatar => {
            Object.keys(avatar.frames).forEach(direction => {
                avatar.frames[direction].forEach((frameData, frameIndex) => {
                    const key = `${avatar.name}_${direction}_${frameIndex}`;
                    if (!this.avatarImages[key]) {
                        const img = new Image();
                        img.src = frameData;
                        this.avatarImages[key] = img;
                    }
                });
            });
        });
    }
    
    drawAvatar(player) {
        const avatar = this.avatars[player.avatar];
        if (!avatar) return;
        
        const screen = this.worldToScreen(player.x, player.y);
        
        // Check if avatar is visible
        if (!this.isVisible(player.x, player.y, 64, 64)) return;
        
        // Get current animation frame
        const frames = avatar.frames[player.facing];
        if (!frames || !frames[player.animationFrame]) return;
        
        // Get cached image
        const key = `${player.avatar}_${player.facing}_${player.animationFrame}`;
        const img = this.avatarImages[key];
        if (!img) return;
        
        // Draw avatar centered on position
        const avatarSize = 64; // Standard avatar size
        this.ctx.drawImage(
            img,
            screen.x - avatarSize / 2,
            screen.y - avatarSize / 2,
            avatarSize,
            avatarSize
        );
        
        // Draw username label
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        
        const textY = screen.y - avatarSize / 2 - 10;
        this.ctx.strokeText(player.username, screen.x, textY);
        this.ctx.fillText(player.username, screen.x, textY);
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw world map with camera offset
        this.ctx.drawImage(
            this.worldImage,
            this.cameraX, this.cameraY, this.canvas.width, this.canvas.height,  // Source rectangle
            0, 0, this.canvas.width, this.canvas.height  // Destination rectangle
        );
        
        // Draw all players
        Object.values(this.players).forEach(player => {
            this.drawAvatar(player);
        });
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});

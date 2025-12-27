// ============================================
// SNOOKER GAME - Using P5.js and Matter.js
// ============================================

/*
 * ============================================================================
 * SNOOKER APP - DESIGN COMMENTARY
 * ============================================================================
 *
 * APP DESIGN OVERVIEW
 * -------------------
 * This snooker application was developed using P5.js for rendering and
 * Matter.js for physics simulation, creating a realistic top-down snooker
 * experience. The design prioritises intuitive controls, visual feedback,
 * and physically accurate ball behaviour.
 *
 * CUE CONTROL SYSTEM - MOUSE-BASED APPROACH
 * ------------------------------------------
 * The cue system utilises a two-phase mouse interaction model rather than
 * keyboard controls or elastic-band mechanics. This design choice was made
 * for several reasons:
 *
 * 1. INTUITIVE AIMING: Moving the mouse around the cue ball naturally
 *    positions the cue, mimicking how a player would walk around a real
 *    table to find their angle. The cue always points toward the mouse
 *    cursor, providing immediate visual feedback.
 *
 * 2. SEPARATED AIM AND POWER: When the user clicks, the aim angle locks
 *    in place. Dragging then controls power only, preventing accidental
 *    aim changes during the power-setting phase. This mirrors real snooker
 *    where players first align their shot, then focus on stroke power.
 *
 * 3. POWER CALCULATION: Power is determined by drag distance from the
 *    initial click point. This provides fine-grained control - small drags
 *    for delicate shots, larger drags for powerful breaks. The SHIFT key
 *    reduces sensitivity for precision adjustments.
 *
 * 4. NON-ELASTIC BEHAVIOUR: Unlike elastic-band mechanics where releasing
 *    snaps the cue forward, this system applies an instantaneous force
 *    calculated from the pullback distance. This feels more like striking
 *    a ball rather than launching it with a slingshot.
 *
 * The cue ball placement also requires user interaction within the D-zone,
 * enforcing proper snooker rules and preventing invalid starting positions.
 *
 * CREATIVE EXTENSION - PRECISION AIMING SYSTEM
 * ---------------------------------------------
 * The extension implements three interconnected features not commonly found
 * in browser-based snooker games:
 *
 * 1. TRAJECTORY PREDICTION: A real-time path visualisation shows where the
 *    cue ball will travel, including up to three cushion bounces. This uses
 *    step-based ray casting with cushion reflection calculations. The path
 *    fades over distance and changes colour at each bounce point.
 *
 * 2. COLLISION PREVIEW: When the trajectory intersects a target ball, a
 *    "ghost ball" appears at the contact point. The system calculates and
 *    displays deflection paths for both balls using vector mathematics,
 *    showing players exactly where balls will travel after impact.
 *
 * 3. SPIN CONTROL SYSTEM: An interactive UI allows players to apply top,
 *    back, or side spin (english) by clicking on a cue ball diagram. Spin
 *    affects shot physics - side spin curves the trajectory, while top/back
 *    spin modifies friction and deflection angles after collision.
 *
 * 4. SLOW-MOTION REPLAY: Every shot is automatically recorded. Players can
 *    review their shots at 0.25x speed, useful for analysing technique and
 *    understanding ball physics.
 *
 * This extension is unique because it combines predictive physics simulation
 * with real-time visualisation, essentially giving players "x-ray vision"
 * of shot outcomes before execution. The spin system adds strategic depth
 * beyond simple point-and-shoot mechanics, while trajectory prediction
 * transforms the game into a learning tool for understanding snooker physics.
 *
 * Technical challenges included implementing line-circle intersection for
 * collision detection, vector reflection for cushion bounces, and frame
 * capture for the replay system - all running in real-time without
 * impacting game performance.
 *
 * ============================================================================
 */


// Matter.js module aliases
var Engine = Matter.Engine,
    World = Matter.World,
    Bodies = Matter.Bodies,
    Body = Matter.Body;

// Physics engine
var engine;
var world;

// ------------------------------------------
// TABLE DIMENSIONS
// Standard snooker table ratio is 2:1 (12ft x 6ft)
// ------------------------------------------
var tableLength = 900;  // pixels (represents 12ft)
var tableWidth = tableLength / 2;  // 450px (represents 6ft)
var cushionThickness = 25;
var railWidth = 35;  // wooden rail around cushions

// Playing area (inside cushions)
var playAreaLength;
var playAreaWidth;

// Table position (centered on canvas)
var tableX, tableY;

// ------------------------------------------
// BALL DIMENSIONS
// Ball diameter = table width / 36
// ------------------------------------------
var ballDiameter;
var ballRadius;

// ------------------------------------------
// POCKET DIMENSIONS
// Pocket size = 1.5 * ball diameter
// ------------------------------------------
var pocketSize;

// ------------------------------------------
// BAULK LINE AND "D" ZONE
// Baulk line is 1/5 of playing length from bottom
// D radius is approx 1/6 of table width
// ------------------------------------------
var baulkLineY;
var dRadius;
var dCenterX;

// ------------------------------------------
// BALL POSITIONS (spots on table)
// ------------------------------------------
var spotPositions = {};

// ------------------------------------------
// BALLS ARRAYS
// Organized by category for easy access
// ------------------------------------------
var cueBall;
var redBalls = [];
var colouredBalls = {
    yellow: null,
    green: null,
    brown: null,
    blue: null,
    pink: null,
    black: null
};

// Ball colours - using standard snooker colours
var BALL_COLORS = {
    cue: '#FFFEF2',
    red: '#D32F2F',
    yellow: '#FDD835',
    green: '#388E3C',
    brown: '#6D4C41',
    blue: '#1976D2',
    pink: '#F48FB1',
    black: '#212121'
};

// ------------------------------------------
// CUE STICK
// ------------------------------------------
var cue = {
    angle: 0,
    length: 280,
    pullBack: 0,         // how far pulled back (power)
    maxPullBack: 120,    // maximum pull distance
    isAiming: false,     // currently aiming
    tipOffset: 10,       // gap between cue tip and ball
    dragStartX: 0,       // where mouse was pressed
    dragStartY: 0
};

// ------------------------------------------
// GAME STATE
// ------------------------------------------
var currentMode = 1;
var cueBallPlaced = false;     // has cue ball been placed?
var isShooting = false;        // is a shot in progress?
var canShoot = true;           // can player take a shot?

// ------------------------------------------
// PHYSICS CONSTANTS
// Tuned for realistic snooker ball behavior
// ------------------------------------------
var BALL_FRICTION = 0.001;          // surface friction (minimal)
var BALL_RESTITUTION = 0.98;        // ball-to-ball bounce (very bouncy)
var BALL_FRICTION_AIR = 0.001;      // air/cloth resistance (minimal - balls roll far)
var BALL_FRICTION_STATIC = 0.005;   // static friction (minimal)
var BALL_DENSITY = 0.001;            // ball mass (very light = maximum response)

var CUSHION_RESTITUTION = 0.75;     // cushion bounce (lower than ball-to-ball)
var CUSHION_FRICTION = 0.03;        // cushion surface friction

// ------------------------------------------
// ANIMATION EFFECTS
// ------------------------------------------

// Ball trail effect - stores recent positions for each ball
var ballTrails = {};          // key: ball id, value: array of {x, y, age}
var TRAIL_LENGTH = 12;        // number of trail segments
var TRAIL_FADE_RATE = 0.08;   // how fast trail fades

// Cue impact effect
var impactEffect = {
    active: false,
    x: 0,
    y: 0,
    time: 0,
    maxTime: 25,          // frames the effect lasts
    rings: []             // emanating circles
};

// Pocket entry animations
var pocketAnimations = [];    // active pocket entry effects
var pocketPositions = [];     // will be initialized in setup

// ------------------------------------------
// CREATIVE EXTENSION: PRECISION AIMING SYSTEM
// Features:
// 1. Trajectory prediction with cushion bounces
// 2. Spin control (top/back/left/right spin)
// 3. Ghost ball collision preview
// 4. Curved shot prediction from spin
// ------------------------------------------

var spinControl = {
    x: 0,              // horizontal spin (-1 to 1) - left/right english
    y: 0,              // vertical spin (-1 to 1) - top/back spin
    maxSpin: 1,
    uiX: 0,            // UI position (set in setup)
    uiY: 0,
    uiRadius: 35,
    isDragging: false
};

var trajectoryPreview = {
    enabled: true,
    maxBounces: 3,         // predict up to 3 cushion bounces
    maxDistance: 800,      // max prediction distance
    points: [],            // predicted path points
    ghostBall: null,       // predicted first collision
    collisionBalls: []     // balls that will be hit
};

// Slow motion replay system
var replaySystem = {
    enabled: false,
    recording: false,
    frames: [],
    maxFrames: 180,        // 3 seconds at 60fps
    playbackIndex: 0,
    playbackSpeed: 0.25,
    showReplay: false
};

// ------------------------------------------
// TABLE COLOURS
// ------------------------------------------
var TABLE_CLOTH = '#0B6623';    // baize green
var CUSHION_COLOR = '#0B5E20';  // darker green for cushions
var RAIL_COLOR = '#5D4037';     // brown wood
var POCKET_COLOR = '#1B1B1B';   // black pockets


function setup() {
    // Canvas sized to fit table with some margin
    createCanvas(1100, 700);
    
    // Initialize Matter.js engine
    engine = Engine.create();
    world = engine.world;
    
    // Set gravity to zero for top-down view
    engine.world.gravity.y = 0;
    engine.world.gravity.x = 0;
    
    // Calculate all measurements
    initTableMeasurements();
    
    // Initialize pocket positions for animations
    initPocketPositions();
    
    // Initialize spin control UI position (bottom right)
    spinControl.uiX = width - 60;
    spinControl.uiY = height - 60;
    
    // Initialize ball spots
    initBallSpots();
    
    // Create the balls
    createBalls();
    
    // Create table boundaries (cushions as physics bodies)
    createCushionBodies();
}


function initPocketPositions() {
    // Define pocket center positions for collision detection
    var offset = pocketSize * 0.35;
    
    pocketPositions = [
        // Corner pockets
        { x: tableX + offset, y: tableY + offset },
        { x: tableX + tableLength - offset, y: tableY + offset },
        { x: tableX + offset, y: tableY + tableWidth - offset },
        { x: tableX + tableLength - offset, y: tableY + tableWidth - offset },
        // Middle pockets
        { x: tableX + tableLength / 2, y: tableY },
        { x: tableX + tableLength / 2, y: tableY + tableWidth }
    ];
}


function initTableMeasurements() {
    // Center table on canvas
    tableX = (width - tableLength) / 2;
    tableY = (height - tableWidth) / 2;
    
    // Playing area dimensions (inside cushions)
    playAreaLength = tableLength - (cushionThickness * 2);
    playAreaWidth = tableWidth - (cushionThickness * 2);
    
    // Ball size based on table width
    ballDiameter = tableWidth / 36;
    ballRadius = ballDiameter / 2;
    
    // Pocket size
    pocketSize = ballDiameter * 1.5;
    
    // Baulk line position (1/5 from bottom of playing area)
    // In snooker, baulk line is 29 inches from baulk cushion on 12ft table
    // That's roughly 1/5 of the table length
    baulkLineY = tableY + tableWidth - cushionThickness - (playAreaLength * 0.2);
    
    // D semi-circle radius (11.5 inches on real table, roughly 1/6 of width)
    dRadius = playAreaWidth * 0.26;
    dCenterX = tableX + tableLength / 2;
}


function initBallSpots() {
    // Calculate spot positions for coloured balls
    // These are standard positions on a snooker table
    
    var centerX = tableX + tableLength / 2;
    var playTop = tableY + cushionThickness;
    var playBottom = tableY + tableWidth - cushionThickness;
    var playHeight = playBottom - playTop;
    
    // Baulk line Y position for D zone balls
    var baulkY = playBottom - (playHeight * 0.2);
    
    spotPositions = {
        // Coloured ball spots
        yellow: { x: centerX - dRadius, y: baulkY },
        green: { x: centerX + dRadius, y: baulkY },
        brown: { x: centerX, y: baulkY },
        blue: { x: centerX, y: playTop + playHeight / 2 },
        pink: { x: centerX, y: playTop + playHeight * 0.25 },
        black: { x: centerX, y: playTop + playHeight * 0.08 },
        
        // Cue ball starts in the D
        cueBall: { x: centerX - dRadius / 2, y: baulkY }
    };
}


function createBalls() {
    // Cue ball is NOT created here - player must place it
    cueBallPlaced = false;
    cueBall = null;
    
    // Create coloured balls at their spots
    createColouredBalls();
    
    // Create red balls based on current mode
    createRedBallsByMode(currentMode);
}


function getBallOptions(label) {
    // Standard physics options for all balls
    return {
        friction: BALL_FRICTION,
        restitution: BALL_RESTITUTION,
        frictionAir: BALL_FRICTION_AIR,
        frictionStatic: BALL_FRICTION_STATIC,
        density: BALL_DENSITY,
        label: label
    };
}


function createCueBall(posX, posY) {
    // Create cue ball at specified position
    cueBall = Bodies.circle(
        posX,
        posY,
        ballRadius,
        getBallOptions('cueBall')
    );
    World.add(world, cueBall);
    cueBallPlaced = true;
}


function createColouredBalls() {
    for (var colour in colouredBalls) {
        var pos = spotPositions[colour];
        colouredBalls[colour] = Bodies.circle(
            pos.x,
            pos.y,
            ballRadius,
            getBallOptions(colour)
        );
        World.add(world, colouredBalls[colour]);
    }
}


function createRedBallsByMode(mode) {
    // Clear existing red balls first
    clearRedBalls();
    
    if (mode === 1) {
        // Mode 1: Standard triangle formation
        createRedTriangle();
    } else if (mode === 2) {
        // Mode 2: Random clusters
        createRedClusters();
    } else if (mode === 3) {
        // Mode 3: Practice mode - spread across table
        createPracticeReds();
    }
}


function clearRedBalls() {
    // Remove all red balls from physics world
    for (var i = 0; i < redBalls.length; i++) {
        World.remove(world, redBalls[i]);
    }
    redBalls = [];
}


function createRedTriangle() {
    // Red balls form a triangle behind the pink spot
    var pinkPos = spotPositions.pink;
    var startX = pinkPos.x;
    var startY = pinkPos.y - ballDiameter * 1.5;  // behind pink
    
    // Triangle has 5 rows: 1, 2, 3, 4, 5 balls
    var rows = 5;
    var ballCount = 0;
    
    for (var row = 0; row < rows; row++) {
        var ballsInRow = row + 1;
        var rowY = startY - (row * ballDiameter * 0.9);  // move up for each row
        var rowStartX = startX - (row * ballRadius);
        
        for (var col = 0; col < ballsInRow; col++) {
            var ballX = rowStartX + (col * ballDiameter);
            var redBall = Bodies.circle(
                ballX,
                rowY,
                ballRadius,
                getBallOptions('red')
            );
            redBalls.push(redBall);
            World.add(world, redBall);
            ballCount++;
            
            if (ballCount >= 15) break;
        }
        if (ballCount >= 15) break;
    }
}


function createRedClusters() {
    // Mode 2: Create red balls in random clusters
    // We'll make 3 clusters with 5 balls each
    
    var innerLeft = tableX + cushionThickness + pocketSize;
    var innerRight = tableX + tableLength - cushionThickness - pocketSize;
    var innerTop = tableY + cushionThickness + pocketSize;
    var innerBottom = tableY + tableWidth - cushionThickness - pocketSize;
    
    // Define 3 cluster center positions (avoiding ball spots)
    var numClusters = 3;
    var ballsPerCluster = 5;
    
    for (var cluster = 0; cluster < numClusters; cluster++) {
        // Random center for this cluster
        var clusterX = random(innerLeft + 50, innerRight - 50);
        var clusterY = random(innerTop + 30, innerBottom - 30);
        
        // Place balls around this center point
        for (var b = 0; b < ballsPerCluster; b++) {
            // Random offset from cluster center
            var offsetX = random(-ballDiameter * 2, ballDiameter * 2);
            var offsetY = random(-ballDiameter * 2, ballDiameter * 2);
            
            var ballX = clusterX + offsetX;
            var ballY = clusterY + offsetY;
            
            // Keep within bounds
            ballX = constrain(ballX, innerLeft, innerRight);
            ballY = constrain(ballY, innerTop, innerBottom);
            
            var redBall = Bodies.circle(ballX, ballY, ballRadius, getBallOptions('red'));
            redBalls.push(redBall);
            World.add(world, redBall);
        }
    }
}


function createPracticeReds() {
    // Mode 3: Practice mode - spread reds across the table
    // Useful for practicing different shot angles
    
    var innerLeft = tableX + cushionThickness + ballDiameter;
    var innerRight = tableX + tableLength - cushionThickness - ballDiameter;
    var innerTop = tableY + cushionThickness + ballDiameter;
    var innerBottom = tableY + tableWidth - cushionThickness - ballDiameter;
    
    // Create a grid-like spread with some randomness
    var cols = 5;
    var rows = 3;
    var spacingX = (innerRight - innerLeft) / (cols + 1);
    var spacingY = (innerBottom - innerTop) / (rows + 1);
    
    var ballCount = 0;
    
    for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
            if (ballCount >= 15) break;
            
            // Base position on grid
            var baseX = innerLeft + spacingX * (col + 1);
            var baseY = innerTop + spacingY * (row + 1);
            
            // Add random offset for natural look
            var offsetX = random(-ballDiameter, ballDiameter);
            var offsetY = random(-ballDiameter, ballDiameter);
            
            var ballX = baseX + offsetX;
            var ballY = baseY + offsetY;
            
            // Check not too close to coloured ball spots
            if (!isTooCloseToSpot(ballX, ballY)) {
                var redBall = Bodies.circle(ballX, ballY, ballRadius, getBallOptions('red'));
                redBalls.push(redBall);
                World.add(world, redBall);
                ballCount++;
            }
        }
        if (ballCount >= 15) break;
    }
    
    // Fill remaining balls if we skipped some spots
    while (redBalls.length < 15) {
        var randX = random(innerLeft, innerRight);
        var randY = random(innerTop, innerBottom);
        
        if (!isTooCloseToSpot(randX, randY)) {
            var redBall = Bodies.circle(randX, randY, ballRadius, getBallOptions('red'));
            redBalls.push(redBall);
            World.add(world, redBall);
        }
    }
}


function isTooCloseToSpot(x, y) {
    // Check if position is too close to any coloured ball spot
    var minDistance = ballDiameter * 2;
    
    for (var colour in spotPositions) {
        if (colour === 'cueBall') continue;
        
        var spot = spotPositions[colour];
        var dist = sqrt(pow(x - spot.x, 2) + pow(y - spot.y, 2));
        
        if (dist < minDistance) {
            return true;
        }
    }
    return false;
}


function resetAllBalls() {
    // Remove all balls from world
    clearRedBalls();
    
    if (cueBall) {
        World.remove(world, cueBall);
        cueBall = null;
    }
    
    for (var colour in colouredBalls) {
        if (colouredBalls[colour]) {
            World.remove(world, colouredBalls[colour]);
        }
    }
    
    // Reset game state
    cueBallPlaced = false;
    cue.isAiming = false;
    cue.pullBack = 0;
    
    // Recreate coloured and red balls (cue ball placed by user)
    createColouredBalls();
    createRedBallsByMode(currentMode);
}


function keyPressed() {
    // Mode switching with number keys
    if (key === '1') {
        currentMode = 1;
        resetAllBalls();
    } else if (key === '2') {
        currentMode = 2;
        resetAllBalls();
    } else if (key === '3') {
        currentMode = 3;
        resetAllBalls();
    }
    
    // R key to reset cue ball position (place again)
    if (key === 'r' || key === 'R') {
        if (cueBall && !isShooting) {
            World.remove(world, cueBall);
            cueBall = null;
            cueBallPlaced = false;
            cue.isAiming = false;
            cue.pullBack = 0;
        }
    }
    
    // Space key to toggle slow motion replay
    if (key === ' ') {
        toggleReplay();
    }
    
    // C key to reset spin to center
    if (key === 'c' || key === 'C') {
        spinControl.x = 0;
        spinControl.y = 0;
    }
    
    // T key to toggle trajectory preview
    if (key === 't' || key === 'T') {
        trajectoryPreview.enabled = !trajectoryPreview.enabled;
    }
}


function mousePressed() {
    // Check if clicking on spin control
    if (isInsideSpinControl(mouseX, mouseY)) {
        spinControl.isDragging = true;
        updateSpinFromMouse();
        return;
    }
    
    // Check if placing cue ball
    if (!cueBallPlaced) {
        if (isInDZone(mouseX, mouseY)) {
            // Check not overlapping other balls
            if (!isOverlappingBall(mouseX, mouseY)) {
                createCueBall(mouseX, mouseY);
            }
        }
        return;
    }
    
    // Start aiming if cue ball is placed and can shoot
    if (cueBallPlaced && canShoot && cueBall) {
        // Lock the aim angle at click time
        var dx = mouseX - cueBall.position.x;
        var dy = mouseY - cueBall.position.y;
        cue.angle = atan2(dy, dx);
        
        // Record drag start position for power calculation
        cue.dragStartX = mouseX;
        cue.dragStartY = mouseY;
        
        cue.isAiming = true;
        cue.pullBack = 0;
    }
}


function mouseDragged() {
    // Handle spin control dragging
    if (spinControl.isDragging) {
        updateSpinFromMouse();
        return;
    }
    
    // Adjust power while aiming (angle is locked)
    if (cue.isAiming && cueBall) {
        // Calculate distance from the initial click point
        var dx = mouseX - cue.dragStartX;
        var dy = mouseY - cue.dragStartY;
        var dragDistance = sqrt(dx * dx + dy * dy);
        
        // Sensitivity adjustment with SHIFT key
        var sensitivity = keyIsDown(SHIFT) ? 0.25 : 0.8;
        
        // Power increases with drag distance
        cue.pullBack = min(cue.maxPullBack, dragDistance * sensitivity);
    }
}


function mouseReleased() {
    // Stop spin control dragging
    if (spinControl.isDragging) {
        spinControl.isDragging = false;
        return;
    }
    
    // Take the shot
    if (cue.isAiming && cueBall && cue.pullBack > 5) {
        // Start recording for replay
        startRecording();
        shootCueBall();
    }
    
    cue.isAiming = false;
    cue.pullBack = 0;
}


function shootCueBall() {
    // Calculate shot power and direction
    var power = map(cue.pullBack, 0, cue.maxPullBack, 0, 0.5);
    var powerNormalized = cue.pullBack / cue.maxPullBack;
    
    // Direction is toward the mouse (opposite of cue)
    var forceX = cos(cue.angle) * power;
    var forceY = sin(cue.angle) * power;
    
    // Apply spin effect to force direction
    // Side spin (english) adds a slight curve to the initial direction
    var sideSpinEffect = spinControl.x * 0.08 * power;
    var perpX = -sin(cue.angle);
    var perpY = cos(cue.angle);
    forceX += perpX * sideSpinEffect;
    forceY += perpY * sideSpinEffect;
    
    // Top/back spin affects the ball's friction temporarily
    // (simplified: adjust air friction based on spin)
    var spinFrictionMod = 1 + (spinControl.y * 0.3);  // back spin = more friction, top spin = less
    Body.set(cueBall, 'frictionAir', BALL_FRICTION_AIR * spinFrictionMod);
    
    // Trigger impact effect at cue ball position
    triggerImpactEffect(cueBall.position.x, cueBall.position.y, powerNormalized);
    
    // Apply force to cue ball
    Body.applyForce(cueBall, cueBall.position, { x: forceX, y: forceY });
    
    // Apply angular velocity for visual spin effect
    Body.setAngularVelocity(cueBall, spinControl.x * 0.2);
    
    // Update game state
    isShooting = true;
    canShoot = false;
}


function isOverlappingBall(x, y) {
    // Check if position overlaps with any existing ball
    var checkRadius = ballDiameter;  // minimum distance
    
    // Check coloured balls
    for (var colour in colouredBalls) {
        var ball = colouredBalls[colour];
        var dist = sqrt(pow(x - ball.position.x, 2) + pow(y - ball.position.y, 2));
        if (dist < checkRadius) {
            return true;
        }
    }
    
    // Check red balls
    for (var i = 0; i < redBalls.length; i++) {
        var dist = sqrt(pow(x - redBalls[i].position.x, 2) + pow(y - redBalls[i].position.y, 2));
        if (dist < checkRadius) {
            return true;
        }
    }
    
    return false;
}


function createCushionBodies() {
    // Create static bodies for cushions (collision boundaries)
    // Cushions have different restitution than ball-to-ball collisions
    var cushionOptions = {
        isStatic: true,
        restitution: CUSHION_RESTITUTION,
        friction: CUSHION_FRICTION,
        label: 'cushion'
    };
    
    var innerLeft = tableX + cushionThickness;
    var innerRight = tableX + tableLength - cushionThickness;
    var innerTop = tableY + cushionThickness;
    var innerBottom = tableY + tableWidth - cushionThickness;
    
    // Cushion segments (avoiding pockets)
    // Each side has 2 segments with gap for middle pockets
    
    var segmentLength = (playAreaLength - pocketSize * 2) / 2;
    var sideSegmentLength = (playAreaWidth - pocketSize);
    
    // Top cushion - left segment
    var topLeft = Bodies.rectangle(
        innerLeft + segmentLength / 2 + pocketSize / 2,
        innerTop - cushionThickness / 2,
        segmentLength,
        cushionThickness,
        cushionOptions
    );
    
    // Top cushion - right segment
    var topRight = Bodies.rectangle(
        innerRight - segmentLength / 2 - pocketSize / 2,
        innerTop - cushionThickness / 2,
        segmentLength,
        cushionThickness,
        cushionOptions
    );
    
    // Bottom cushion - left segment
    var bottomLeft = Bodies.rectangle(
        innerLeft + segmentLength / 2 + pocketSize / 2,
        innerBottom + cushionThickness / 2,
        segmentLength,
        cushionThickness,
        cushionOptions
    );
    
    // Bottom cushion - right segment
    var bottomRight = Bodies.rectangle(
        innerRight - segmentLength / 2 - pocketSize / 2,
        innerBottom + cushionThickness / 2,
        segmentLength,
        cushionThickness,
        cushionOptions
    );
    
    // Left cushion (full length minus corner pockets)
    var leftCushion = Bodies.rectangle(
        innerLeft - cushionThickness / 2,
        tableY + tableWidth / 2,
        cushionThickness,
        sideSegmentLength,
        cushionOptions
    );
    
    // Right cushion
    var rightCushion = Bodies.rectangle(
        innerRight + cushionThickness / 2,
        tableY + tableWidth / 2,
        cushionThickness,
        sideSegmentLength,
        cushionOptions
    );
    
    World.add(world, [topLeft, topRight, bottomLeft, bottomRight, leftCushion, rightCushion]);
}


function draw() {
    background('#1a1a2e');
    
    // Handle replay mode
    if (replaySystem.showReplay) {
        drawReplayFrame();
        return;
    }
    
    // Update physics
    Engine.update(engine);
    
    // Record frame for replay if shot in progress
    if (isShooting && replaySystem.recording) {
        recordReplayFrame();
    }
    
    // Update animations
    updateBallTrails();
    updateImpactEffect();
    updatePocketAnimations();
    
    // Check for balls entering pockets
    checkPocketCollisions();
    
    // Check if balls have stopped moving
    checkBallsMoving();
    
    // Calculate trajectory prediction when aiming
    if (cueBallPlaced && canShoot && cueBall) {
        calculateTrajectoryPreview();
    }
    
    // Draw the table
    drawTable();
    
    // Draw trajectory prediction (under everything)
    if (cueBallPlaced && canShoot && trajectoryPreview.enabled) {
        drawTrajectoryPreview();
    }
    
    // Draw ball trails (behind balls)
    drawBallTrails();
    
    // Draw cue ball placement guide if not placed
    if (!cueBallPlaced) {
        drawCueBallPlacementGuide();
    }
    
    // Draw all balls
    drawBalls();
    
    // Draw impact effect (on top of balls)
    drawImpactEffect();
    
    // Draw pocket entry animations
    drawPocketAnimations();
    
    // Draw the cue stick
    if (cueBallPlaced && canShoot) {
        drawCue();
    }
    
    // Draw spin control UI
    drawSpinControlUI();
    
    // Draw mode indicator and instructions
    drawModeIndicator();
    drawInstructions();
}


function checkBallsMoving() {
    // Check if any balls are still moving
    var threshold = 0.15;  // velocity threshold for "stopped"
    var anyMoving = false;
    
    // Check cue ball
    if (cueBall) {
        var speed = Matter.Vector.magnitude(cueBall.velocity);
        if (speed > threshold) {
            anyMoving = true;
        }
    }
    
    // Check red balls
    for (var i = 0; i < redBalls.length; i++) {
        var speed = Matter.Vector.magnitude(redBalls[i].velocity);
        if (speed > threshold) {
            anyMoving = true;
            break;
        }
    }
    
    // Check coloured balls
    if (!anyMoving) {
        for (var colour in colouredBalls) {
            var speed = Matter.Vector.magnitude(colouredBalls[colour].velocity);
            if (speed > threshold) {
                anyMoving = true;
                break;
            }
        }
    }
    
    // Update shooting state
    if (isShooting && !anyMoving) {
        isShooting = false;
        canShoot = true;
        stopRecording();  // stop recording for replay
    }
}


function drawCueBallPlacementGuide() {
    // Highlight the D zone where cue ball can be placed
    push();
    
    var innerBottom = tableY + tableWidth - cushionThickness;
    var playHeight = tableWidth - cushionThickness * 2;
    var baulkY = innerBottom - (playHeight * 0.2);
    var centerX = tableX + tableLength / 2;
    
    // Check if mouse is in valid D zone
    var inDZone = isInDZone(mouseX, mouseY);
    
    // Highlight D area
    noFill();
    stroke(inDZone ? '#00FF00' : '#FFFF00');
    strokeWeight(3);
    arc(centerX, baulkY, dRadius * 2, dRadius * 2, -HALF_PI, HALF_PI);
    
    // Draw ghost ball at mouse position if in D zone
    if (inDZone) {
        fill(255, 255, 255, 100);
        noStroke();
        ellipse(mouseX, mouseY, ballDiameter);
    }
    
    pop();
}


function isInDZone(x, y) {
    // Check if a point is inside the D zone (semicircle)
    var innerLeft = tableX + cushionThickness;
    var innerRight = tableX + tableLength - cushionThickness;
    var innerBottom = tableY + tableWidth - cushionThickness;
    var playHeight = tableWidth - cushionThickness * 2;
    var baulkY = innerBottom - (playHeight * 0.2);
    var centerX = tableX + tableLength / 2;
    
    // Must be below baulk line (in the baulk area)
    if (y < baulkY) return false;
    if (y > innerBottom) return false;
    
    // Must be within the D semicircle or on the baulk line within D width
    var distFromCenter = sqrt(pow(x - centerX, 2) + pow(y - baulkY, 2));
    
    // Check if within D semicircle
    if (distFromCenter <= dRadius) {
        // Also check within table bounds
        if (x >= innerLeft && x <= innerRight) {
            return true;
        }
    }
    
    return false;
}


function drawCue() {
    // Only draw cue when not shooting and cue ball exists
    if (!cueBall || isShooting) return;
    
    push();
    
    // Only update aim angle when NOT pulling back (free aiming)
    if (!cue.isAiming) {
        var dx = mouseX - cueBall.position.x;
        var dy = mouseY - cueBall.position.y;
        cue.angle = atan2(dy, dx);
    }
    
    // Cue position (opposite side from mouse)
    var cueStartX = cueBall.position.x - cos(cue.angle) * (ballRadius + cue.tipOffset + cue.pullBack);
    var cueStartY = cueBall.position.y - sin(cue.angle) * (ballRadius + cue.tipOffset + cue.pullBack);
    var cueEndX = cueStartX - cos(cue.angle) * cue.length;
    var cueEndY = cueStartY - sin(cue.angle) * cue.length;
    
    // Draw aiming line (dotted)
    if (cue.isAiming) {
        stroke(255, 255, 255, 60);
        strokeWeight(1);
        drawingContext.setLineDash([5, 5]);
        line(cueBall.position.x, cueBall.position.y,
             cueBall.position.x + cos(cue.angle) * 300,
             cueBall.position.y + sin(cue.angle) * 300);
        drawingContext.setLineDash([]);
    }
    
    // Draw power indicator when pulling back
    if (cue.pullBack > 0) {
        var powerPercent = cue.pullBack / cue.maxPullBack;
        drawPowerIndicator(powerPercent);
    }
    
    // Cue shadow
    stroke(0, 0, 0, 50);
    strokeWeight(12);
    line(cueStartX + 4, cueStartY + 4, cueEndX + 4, cueEndY + 4);
    
    // Main cue body (tapered look)
    // Butt end (thicker, darker wood)
    stroke('#3E2723');
    strokeWeight(10);
    var midX = cueStartX - cos(cue.angle) * (cue.length * 0.6);
    var midY = cueStartY - sin(cue.angle) * (cue.length * 0.6);
    line(midX, midY, cueEndX, cueEndY);
    
    // Shaft (lighter wood, thinner)
    stroke('#D7CCC8');
    strokeWeight(7);
    line(cueStartX, cueStartY, midX, midY);
    
    // Ferrule (white band near tip)
    stroke('#FFFFFF');
    strokeWeight(6);
    var ferruleX = cueStartX - cos(cue.angle) * 8;
    var ferruleY = cueStartY - sin(cue.angle) * 8;
    line(cueStartX, cueStartY, ferruleX, ferruleY);
    
    // Tip (blue chalk)
    stroke('#1565C0');
    strokeWeight(5);
    line(cueStartX, cueStartY, 
         cueStartX - cos(cue.angle) * 3, 
         cueStartY - sin(cue.angle) * 3);
    
    pop();
}


function drawPowerIndicator(powerPercent) {
    // Power bar near the cue ball
    push();
    
    var barWidth = 80;
    var barHeight = 10;
    var barX = cueBall.position.x - barWidth / 2;
    var barY = cueBall.position.y - 40;
    
    // Background
    fill(50, 50, 50, 180);
    noStroke();
    rect(barX, barY, barWidth, barHeight, 3);
    
    // Power fill (green to red gradient effect)
    var r = map(powerPercent, 0, 1, 100, 255);
    var g = map(powerPercent, 0, 1, 200, 50);
    fill(r, g, 50);
    rect(barX, barY, barWidth * powerPercent, barHeight, 3);
    
    // Border
    noFill();
    stroke(255);
    strokeWeight(1);
    rect(barX, barY, barWidth, barHeight, 3);
    
    pop();
}


function drawModeIndicator() {
    // Show current mode in corner
    push();
    fill('#FFFFFF');
    noStroke();
    textSize(14);
    textAlign(LEFT, TOP);
    
    var modeText = "Mode " + currentMode + ": ";
    if (currentMode === 1) {
        modeText += "Standard Formation";
    } else if (currentMode === 2) {
        modeText += "Random Clusters";
    } else if (currentMode === 3) {
        modeText += "Practice Mode";
    }
    
    text(modeText, 15, 15);
    pop();
}


function drawInstructions() {
    push();
    fill('#AAAAAA');
    noStroke();
    textSize(11);
    textAlign(LEFT, TOP);
    
    var yPos = 35;
    text("1/2/3: Mode | R: Re-place | T: Toggle trajectory | SPACE: Replay | C: Reset spin", 15, yPos);
    yPos += 16;
    
    if (replaySystem.showReplay) {
        fill('#FF6666');
        text("Playing slow-motion replay... Press SPACE to exit", 15, yPos);
    } else if (!cueBallPlaced) {
        fill('#FFFF00');
        text("Click in the D zone to place cue ball", 15, yPos);
    } else if (canShoot) {
        text("Aim with mouse | Click+drag for power | Use spin control (bottom right)", 15, yPos);
        yPos += 16;
        fill('#AAAAAA');
        text("SHIFT: Fine power | Trajectory shows predicted path and collisions", 15, yPos);
    } else {
        text("Wait for balls to stop...", 15, yPos);
    }
    
    pop();
}


function drawTable() {
    push();
    
    // Outer wooden rail
    fill(RAIL_COLOR);
    noStroke();
    rectMode(CORNER);
    rect(tableX - railWidth, tableY - railWidth, 
         tableLength + railWidth * 2, tableWidth + railWidth * 2, 8);
    
    // Inner rail detail
    fill('#4E342E');
    rect(tableX - railWidth / 2, tableY - railWidth / 2,
         tableLength + railWidth, tableWidth + railWidth, 5);
    
    // Main table bed (playing surface)
    fill(TABLE_CLOTH);
    rect(tableX, tableY, tableLength, tableWidth);
    
    // Draw cushions
    drawCushions();
    
    // Draw pockets
    drawPockets();
    
    // Draw table markings
    drawTableMarkings();
    
    pop();
}


function drawCushions() {
    fill(CUSHION_COLOR);
    noStroke();
    
    var innerLeft = tableX + cushionThickness;
    var innerRight = tableX + tableLength - cushionThickness;
    var innerTop = tableY + cushionThickness;
    var innerBottom = tableY + tableWidth - cushionThickness;
    
    // Calculate segment sizes accounting for pockets
    var cornerPocketOffset = pocketSize * 0.7;
    var middlePocketOffset = pocketSize * 0.5;
    
    // Top cushion - left part
    beginShape();
    vertex(tableX + cornerPocketOffset, tableY);
    vertex(tableX + tableLength / 2 - middlePocketOffset, tableY);
    vertex(tableX + tableLength / 2 - middlePocketOffset, innerTop);
    vertex(innerLeft + cornerPocketOffset * 0.5, innerTop);
    endShape(CLOSE);
    
    // Top cushion - right part
    beginShape();
    vertex(tableX + tableLength / 2 + middlePocketOffset, tableY);
    vertex(tableX + tableLength - cornerPocketOffset, tableY);
    vertex(innerRight - cornerPocketOffset * 0.5, innerTop);
    vertex(tableX + tableLength / 2 + middlePocketOffset, innerTop);
    endShape(CLOSE);
    
    // Bottom cushion - left part
    beginShape();
    vertex(tableX + cornerPocketOffset, tableY + tableWidth);
    vertex(tableX + tableLength / 2 - middlePocketOffset, tableY + tableWidth);
    vertex(tableX + tableLength / 2 - middlePocketOffset, innerBottom);
    vertex(innerLeft + cornerPocketOffset * 0.5, innerBottom);
    endShape(CLOSE);
    
    // Bottom cushion - right part
    beginShape();
    vertex(tableX + tableLength / 2 + middlePocketOffset, tableY + tableWidth);
    vertex(tableX + tableLength - cornerPocketOffset, tableY + tableWidth);
    vertex(innerRight - cornerPocketOffset * 0.5, innerBottom);
    vertex(tableX + tableLength / 2 + middlePocketOffset, innerBottom);
    endShape(CLOSE);
    
    // Left cushion
    beginShape();
    vertex(tableX, tableY + cornerPocketOffset);
    vertex(tableX, tableY + tableWidth - cornerPocketOffset);
    vertex(innerLeft, innerBottom - cornerPocketOffset * 0.5);
    vertex(innerLeft, innerTop + cornerPocketOffset * 0.5);
    endShape(CLOSE);
    
    // Right cushion
    beginShape();
    vertex(tableX + tableLength, tableY + cornerPocketOffset);
    vertex(tableX + tableLength, tableY + tableWidth - cornerPocketOffset);
    vertex(innerRight, innerBottom - cornerPocketOffset * 0.5);
    vertex(innerRight, innerTop + cornerPocketOffset * 0.5);
    endShape(CLOSE);
}


function drawPockets() {
    fill(POCKET_COLOR);
    noStroke();
    
    var pocketRadius = pocketSize / 2;
    var offset = pocketSize * 0.35;
    
    // Corner pockets (4)
    ellipse(tableX + offset, tableY + offset, pocketSize);
    ellipse(tableX + tableLength - offset, tableY + offset, pocketSize);
    ellipse(tableX + offset, tableY + tableWidth - offset, pocketSize);
    ellipse(tableX + tableLength - offset, tableY + tableWidth - offset, pocketSize);
    
    // Middle pockets (2)
    ellipse(tableX + tableLength / 2, tableY, pocketSize * 0.9);
    ellipse(tableX + tableLength / 2, tableY + tableWidth, pocketSize * 0.9);
}


function drawTableMarkings() {
    // Baulk line
    stroke('#FFFFFF');
    strokeWeight(2);
    
    var innerLeft = tableX + cushionThickness;
    var innerRight = tableX + tableLength - cushionThickness;
    var innerBottom = tableY + tableWidth - cushionThickness;
    var playHeight = tableWidth - cushionThickness * 2;
    
    // Baulk line position
    var baulkY = innerBottom - (playHeight * 0.2);
    line(innerLeft, baulkY, innerRight, baulkY);
    
    // The "D" semi-circle
    noFill();
    stroke('#FFFFFF');
    strokeWeight(2);
    arc(tableX + tableLength / 2, baulkY, dRadius * 2, dRadius * 2, -HALF_PI, HALF_PI);
    
    // Draw spots for coloured balls
    drawBallSpots();
}


function drawBallSpots() {
    // Small spots/markers where coloured balls are placed
    fill('#FFFFFF');
    noStroke();
    var spotSize = 5;
    
    // Draw spots at each position
    ellipse(spotPositions.brown.x, spotPositions.brown.y, spotSize);
    ellipse(spotPositions.yellow.x, spotPositions.yellow.y, spotSize);
    ellipse(spotPositions.green.x, spotPositions.green.y, spotSize);
    ellipse(spotPositions.blue.x, spotPositions.blue.y, spotSize);
    ellipse(spotPositions.pink.x, spotPositions.pink.y, spotSize);
    ellipse(spotPositions.black.x, spotPositions.black.y, spotSize);
}


function drawBalls() {
    // Draw cue ball (if placed)
    if (cueBall) {
        drawSingleBall(cueBall.position.x, cueBall.position.y, BALL_COLORS.cue);
    }
    
    // Draw red balls
    for (var i = 0; i < redBalls.length; i++) {
        drawSingleBall(redBalls[i].position.x, redBalls[i].position.y, BALL_COLORS.red);
    }
    
    // Draw coloured balls
    for (var colour in colouredBalls) {
        var ball = colouredBalls[colour];
        drawSingleBall(ball.position.x, ball.position.y, BALL_COLORS[colour]);
    }
}


function drawSingleBall(x, y, ballColor) {
    // Ball shadow
    noStroke();
    fill(0, 0, 0, 40);
    ellipse(x + 3, y + 3, ballDiameter);
    
    // Main ball
    fill(ballColor);
    ellipse(x, y, ballDiameter);
    
    // Highlight for 3D effect
    fill(255, 255, 255, 80);
    ellipse(x - ballRadius * 0.3, y - ballRadius * 0.3, ballDiameter * 0.35);
}


// ============================================
// ANIMATION EFFECTS
// ============================================

// ------------------------------------------
// BALL TRAIL EFFECT
// ------------------------------------------

function updateBallTrails() {
    // Update trail for cue ball
    if (cueBall) {
        updateSingleBallTrail(cueBall.id, cueBall.position, cueBall.velocity, BALL_COLORS.cue);
    }
    
    // Update trails for red balls
    for (var i = 0; i < redBalls.length; i++) {
        var ball = redBalls[i];
        updateSingleBallTrail(ball.id, ball.position, ball.velocity, BALL_COLORS.red);
    }
    
    // Update trails for coloured balls
    for (var colour in colouredBalls) {
        var ball = colouredBalls[colour];
        if (ball) {
            updateSingleBallTrail(ball.id, ball.position, ball.velocity, BALL_COLORS[colour]);
        }
    }
}


function updateSingleBallTrail(ballId, position, velocity, ballColor) {
    // Only add trail points if ball is moving
    var speed = Matter.Vector.magnitude(velocity);
    
    if (!ballTrails[ballId]) {
        ballTrails[ballId] = [];
    }
    
    var trail = ballTrails[ballId];
    
    // Add new point if moving fast enough
    if (speed > 0.5) {
        trail.unshift({
            x: position.x,
            y: position.y,
            age: 0,
            color: ballColor,
            speed: speed
        });
    }
    
    // Update ages and remove old points
    for (var i = trail.length - 1; i >= 0; i--) {
        trail[i].age += TRAIL_FADE_RATE;
        if (trail[i].age >= 1) {
            trail.splice(i, 1);
        }
    }
    
    // Limit trail length
    while (trail.length > TRAIL_LENGTH) {
        trail.pop();
    }
}


function drawBallTrails() {
    push();
    noStroke();
    
    for (var ballId in ballTrails) {
        var trail = ballTrails[ballId];
        
        for (var i = 0; i < trail.length; i++) {
            var point = trail[i];
            var alpha = map(point.age, 0, 1, 150, 0);
            var size = map(point.age, 0, 1, ballDiameter * 0.8, ballDiameter * 0.2);
            
            // Parse color and apply alpha
            var c = color(point.color);
            c.setAlpha(alpha);
            fill(c);
            
            ellipse(point.x, point.y, size);
        }
    }
    
    pop();
}


// ------------------------------------------
// CUE IMPACT EFFECT
// ------------------------------------------

function triggerImpactEffect(x, y, power) {
    impactEffect.active = true;
    impactEffect.x = x;
    impactEffect.y = y;
    impactEffect.time = 0;
    impactEffect.rings = [];
    
    // Create multiple rings based on power
    var numRings = floor(map(power, 0, 1, 2, 5));
    for (var i = 0; i < numRings; i++) {
        impactEffect.rings.push({
            radius: ballRadius,
            maxRadius: ballRadius * (3 + i * 2),
            alpha: 255,
            delay: i * 3  // stagger the rings
        });
    }
}


function updateImpactEffect() {
    if (!impactEffect.active) return;
    
    impactEffect.time++;
    
    // Update each ring
    var allDone = true;
    for (var i = 0; i < impactEffect.rings.length; i++) {
        var ring = impactEffect.rings[i];
        
        if (ring.delay > 0) {
            ring.delay--;
            allDone = false;
        } else {
            // Expand ring
            ring.radius += (ring.maxRadius - ring.radius) * 0.15;
            ring.alpha *= 0.88;
            
            if (ring.alpha > 5) {
                allDone = false;
            }
        }
    }
    
    if (allDone || impactEffect.time > impactEffect.maxTime) {
        impactEffect.active = false;
    }
}


function drawImpactEffect() {
    if (!impactEffect.active) return;
    
    push();
    noFill();
    
    for (var i = 0; i < impactEffect.rings.length; i++) {
        var ring = impactEffect.rings[i];
        
        if (ring.delay <= 0 && ring.alpha > 5) {
            // Draw expanding ring
            stroke(255, 255, 255, ring.alpha);
            strokeWeight(2);
            ellipse(impactEffect.x, impactEffect.y, ring.radius * 2);
            
            // Inner glow
            stroke(200, 220, 255, ring.alpha * 0.5);
            strokeWeight(4);
            ellipse(impactEffect.x, impactEffect.y, ring.radius * 1.5);
        }
    }
    
    // Central flash (only at start)
    if (impactEffect.time < 5) {
        var flashAlpha = map(impactEffect.time, 0, 5, 200, 0);
        fill(255, 255, 255, flashAlpha);
        noStroke();
        ellipse(impactEffect.x, impactEffect.y, ballDiameter * 1.5);
    }
    
    pop();
}


// ------------------------------------------
// POCKET ENTRY EFFECT
// ------------------------------------------

function checkPocketCollisions() {
    var pocketRadius = pocketSize * 0.6;
    
    // Check cue ball
    if (cueBall) {
        for (var p = 0; p < pocketPositions.length; p++) {
            var pocket = pocketPositions[p];
            var dist = sqrt(pow(cueBall.position.x - pocket.x, 2) + 
                           pow(cueBall.position.y - pocket.y, 2));
            
            if (dist < pocketRadius) {
                // Cue ball potted - trigger animation and remove
                triggerPocketAnimation(pocket.x, pocket.y, BALL_COLORS.cue);
                World.remove(world, cueBall);
                cueBall = null;
                cueBallPlaced = false;
                break;
            }
        }
    }
    
    // Check red balls
    for (var i = redBalls.length - 1; i >= 0; i--) {
        var ball = redBalls[i];
        for (var p = 0; p < pocketPositions.length; p++) {
            var pocket = pocketPositions[p];
            var dist = sqrt(pow(ball.position.x - pocket.x, 2) + 
                           pow(ball.position.y - pocket.y, 2));
            
            if (dist < pocketRadius) {
                // Ball potted
                triggerPocketAnimation(pocket.x, pocket.y, BALL_COLORS.red);
                World.remove(world, ball);
                
                // Clean up trail
                delete ballTrails[ball.id];
                
                redBalls.splice(i, 1);
                break;
            }
        }
    }
    
    // Check coloured balls
    for (var colour in colouredBalls) {
        var ball = colouredBalls[colour];
        if (!ball) continue;
        
        for (var p = 0; p < pocketPositions.length; p++) {
            var pocket = pocketPositions[p];
            var dist = sqrt(pow(ball.position.x - pocket.x, 2) + 
                           pow(ball.position.y - pocket.y, 2));
            
            if (dist < pocketRadius) {
                // Coloured ball potted - animate and re-spot
                triggerPocketAnimation(pocket.x, pocket.y, BALL_COLORS[colour]);
                
                // Re-spot the coloured ball
                var spotPos = spotPositions[colour];
                Body.setPosition(ball, { x: spotPos.x, y: spotPos.y });
                Body.setVelocity(ball, { x: 0, y: 0 });
                break;
            }
        }
    }
}


function triggerPocketAnimation(x, y, ballColor) {
    pocketAnimations.push({
        x: x,
        y: y,
        color: ballColor,
        time: 0,
        maxTime: 30,
        size: ballDiameter,
        particles: createPocketParticles(x, y, ballColor)
    });
}


function createPocketParticles(x, y, ballColor) {
    // Create particles for pocket entry effect
    var particles = [];
    var numParticles = 8;
    
    for (var i = 0; i < numParticles; i++) {
        var angle = (TWO_PI / numParticles) * i + random(-0.2, 0.2);
        var speed = random(1.5, 3);
        
        particles.push({
            x: x,
            y: y,
            vx: cos(angle) * speed,
            vy: sin(angle) * speed,
            size: random(3, 6),
            alpha: 255,
            color: ballColor
        });
    }
    
    return particles;
}


function updatePocketAnimations() {
    for (var i = pocketAnimations.length - 1; i >= 0; i--) {
        var anim = pocketAnimations[i];
        anim.time++;
        
        // Shrink the ball representation
        anim.size *= 0.85;
        
        // Update particles
        for (var j = 0; j < anim.particles.length; j++) {
            var p = anim.particles[j];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;  // gravity
            p.alpha *= 0.92;
            p.size *= 0.97;
        }
        
        // Remove finished animations
        if (anim.time >= anim.maxTime) {
            pocketAnimations.splice(i, 1);
        }
    }
}


function drawPocketAnimations() {
    push();
    noStroke();
    
    for (var i = 0; i < pocketAnimations.length; i++) {
        var anim = pocketAnimations[i];
        
        // Draw shrinking ball
        if (anim.size > 1) {
            var alpha = map(anim.time, 0, anim.maxTime, 255, 0);
            var c = color(anim.color);
            c.setAlpha(alpha);
            fill(c);
            ellipse(anim.x, anim.y, anim.size);
        }
        
        // Draw particles
        for (var j = 0; j < anim.particles.length; j++) {
            var p = anim.particles[j];
            if (p.alpha > 5) {
                var pc = color(p.color);
                pc.setAlpha(p.alpha);
                fill(pc);
                ellipse(p.x, p.y, p.size);
            }
        }
        
        // Draw pocket glow
        var glowAlpha = map(anim.time, 0, 15, 150, 0);
        if (glowAlpha > 0) {
            fill(255, 255, 200, glowAlpha);
            ellipse(anim.x, anim.y, pocketSize * 1.3);
        }
    }
    
    pop();
}


// ============================================
// CREATIVE EXTENSION: PRECISION AIMING SYSTEM
// ============================================

// ------------------------------------------
// SPIN CONTROL UI
// ------------------------------------------

function drawSpinControlUI() {
    push();
    
    var cx = spinControl.uiX;
    var cy = spinControl.uiY;
    var r = spinControl.uiRadius;
    
    // Background circle (cue ball representation)
    fill(40, 40, 50, 200);
    stroke(100, 100, 120);
    strokeWeight(2);
    ellipse(cx, cy, r * 2 + 10);
    
    // Inner cue ball
    fill(255, 255, 240);
    noStroke();
    ellipse(cx, cy, r * 2);
    
    // Grid lines for reference
    stroke(200, 200, 200, 100);
    strokeWeight(1);
    line(cx - r, cy, cx + r, cy);
    line(cx, cy - r, cx, cy + r);
    
    // Spin indicator dot
    var dotX = cx + spinControl.x * r * 0.85;
    var dotY = cy + spinControl.y * r * 0.85;
    
    // Dot shadow
    fill(0, 0, 0, 80);
    noStroke();
    ellipse(dotX + 2, dotY + 2, 14);
    
    // Main dot with color based on spin type
    var dotColor = getSpinColor();
    fill(dotColor);
    stroke(255);
    strokeWeight(2);
    ellipse(dotX, dotY, 14);
    
    // Label
    fill(255);
    noStroke();
    textSize(10);
    textAlign(CENTER, TOP);
    text("SPIN", cx, cy + r + 8);
    
    // Spin type indicator
    var spinType = getSpinTypeLabel();
    if (spinType !== "CENTER") {
        textSize(9);
        fill(dotColor);
        text(spinType, cx, cy + r + 20);
    }
    
    pop();
}


function getSpinColor() {
    // Color based on spin direction
    var spinMagnitude = sqrt(spinControl.x * spinControl.x + spinControl.y * spinControl.y);
    
    if (spinMagnitude < 0.1) {
        return color(100, 100, 100);  // center - gray
    }
    
    // Mix colors based on spin direction
    var r = 50, g = 50, b = 200;  // base blue
    
    if (spinControl.y < -0.2) {
        // Top spin - green
        g = 200;
        b = 100;
    } else if (spinControl.y > 0.2) {
        // Back spin - red
        r = 220;
        g = 80;
        b = 80;
    }
    
    if (abs(spinControl.x) > 0.2) {
        // Side spin - add purple tint
        r = max(r, 150);
        b = max(b, 180);
    }
    
    return color(r, g, b);
}


function getSpinTypeLabel() {
    var labels = [];
    
    if (spinControl.y < -0.3) labels.push("TOP");
    if (spinControl.y > 0.3) labels.push("BACK");
    if (spinControl.x < -0.3) labels.push("LEFT");
    if (spinControl.x > 0.3) labels.push("RIGHT");
    
    if (labels.length === 0) return "CENTER";
    return labels.join(" + ");
}


function isInsideSpinControl(x, y) {
    var dist = sqrt(pow(x - spinControl.uiX, 2) + pow(y - spinControl.uiY, 2));
    return dist <= spinControl.uiRadius;
}


function updateSpinFromMouse() {
    // Calculate spin based on mouse position within the control
    var dx = mouseX - spinControl.uiX;
    var dy = mouseY - spinControl.uiY;
    
    // Normalize to -1 to 1 range
    spinControl.x = constrain(dx / spinControl.uiRadius, -1, 1);
    spinControl.y = constrain(dy / spinControl.uiRadius, -1, 1);
}


// ------------------------------------------
// TRAJECTORY PREDICTION
// ------------------------------------------

function calculateTrajectoryPreview() {
    trajectoryPreview.points = [];
    trajectoryPreview.ghostBall = null;
    trajectoryPreview.collisionBalls = [];
    
    if (!cueBall) return;
    
    // Starting position and direction
    var startX = cueBall.position.x;
    var startY = cueBall.position.y;
    var dirX = cos(cue.angle);
    var dirY = sin(cue.angle);
    
    // Apply spin curve effect to initial direction
    var curveAmount = spinControl.x * 0.15;  // side spin curves the path
    
    // Simulate trajectory
    var currentX = startX;
    var currentY = startY;
    var currentDirX = dirX;
    var currentDirY = dirY;
    var bounces = 0;
    var totalDist = 0;
    var stepSize = 5;
    
    // Get table boundaries
    var innerLeft = tableX + cushionThickness + ballRadius;
    var innerRight = tableX + tableLength - cushionThickness - ballRadius;
    var innerTop = tableY + cushionThickness + ballRadius;
    var innerBottom = tableY + tableWidth - cushionThickness - ballRadius;
    
    // Trace the path
    while (bounces <= trajectoryPreview.maxBounces && totalDist < trajectoryPreview.maxDistance) {
        // Add point to trajectory
        trajectoryPreview.points.push({
            x: currentX,
            y: currentY,
            bounce: bounces
        });
        
        // Move forward
        var nextX = currentX + currentDirX * stepSize;
        var nextY = currentY + currentDirY * stepSize;
        
        // Apply gradual curve from spin (subtle effect)
        if (abs(curveAmount) > 0.01) {
            var perpX = -currentDirY;
            var perpY = currentDirX;
            nextX += perpX * curveAmount * 0.3;
            nextY += perpY * curveAmount * 0.3;
            
            // Reduce curve effect over distance
            curveAmount *= 0.995;
        }
        
        // Check for cushion bounces
        var bounced = false;
        
        if (nextX < innerLeft) {
            nextX = innerLeft;
            currentDirX = -currentDirX;
            bounces++;
            bounced = true;
        } else if (nextX > innerRight) {
            nextX = innerRight;
            currentDirX = -currentDirX;
            bounces++;
            bounced = true;
        }
        
        if (nextY < innerTop) {
            nextY = innerTop;
            currentDirY = -currentDirY;
            bounces++;
            bounced = true;
        } else if (nextY > innerBottom) {
            nextY = innerBottom;
            currentDirY = -currentDirY;
            bounces++;
            bounced = true;
        }
        
        // Check for ball collisions (only on first segment before bounce)
        if (bounces === 0 && !trajectoryPreview.ghostBall) {
            var hitBall = checkTrajectoryBallCollision(currentX, currentY, nextX, nextY);
            if (hitBall) {
                trajectoryPreview.ghostBall = {
                    x: hitBall.hitX,
                    y: hitBall.hitY,
                    targetBall: hitBall.ball,
                    targetColor: hitBall.color
                };
                
                // Calculate deflection paths
                calculateDeflectionPaths(hitBall);
                break;
            }
        }
        
        currentX = nextX;
        currentY = nextY;
        totalDist += stepSize;
        
        // Renormalize direction after curve
        var dirLen = sqrt(currentDirX * currentDirX + currentDirY * currentDirY);
        currentDirX /= dirLen;
        currentDirY /= dirLen;
    }
}


function checkTrajectoryBallCollision(x1, y1, x2, y2) {
    var minDist = ballDiameter;
    var closest = null;
    
    // Check all balls
    var allBalls = getAllBallsExceptCue();
    
    for (var i = 0; i < allBalls.length; i++) {
        var ball = allBalls[i];
        var bx = ball.body.position.x;
        var by = ball.body.position.y;
        
        // Line segment to circle collision
        var collision = lineCircleCollision(x1, y1, x2, y2, bx, by, minDist);
        
        if (collision && (!closest || collision.dist < closest.dist)) {
            closest = {
                ball: ball.body,
                color: ball.color,
                hitX: collision.x,
                hitY: collision.y,
                dist: collision.dist
            };
        }
    }
    
    return closest;
}


function getAllBallsExceptCue() {
    var balls = [];
    
    // Red balls
    for (var i = 0; i < redBalls.length; i++) {
        balls.push({ body: redBalls[i], color: BALL_COLORS.red });
    }
    
    // Coloured balls
    for (var colour in colouredBalls) {
        if (colouredBalls[colour]) {
            balls.push({ body: colouredBalls[colour], color: BALL_COLORS[colour] });
        }
    }
    
    return balls;
}


function lineCircleCollision(x1, y1, x2, y2, cx, cy, radius) {
    // Vector from line start to circle center
    var dx = x2 - x1;
    var dy = y2 - y1;
    var fx = x1 - cx;
    var fy = y1 - cy;
    
    var a = dx * dx + dy * dy;
    var b = 2 * (fx * dx + fy * dy);
    var c = fx * fx + fy * fy - radius * radius;
    
    var discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return null;
    
    discriminant = sqrt(discriminant);
    var t1 = (-b - discriminant) / (2 * a);
    var t2 = (-b + discriminant) / (2 * a);
    
    // Check if intersection is within segment
    if (t1 >= 0 && t1 <= 1) {
        return {
            x: x1 + t1 * dx,
            y: y1 + t1 * dy,
            dist: t1 * sqrt(a)
        };
    }
    
    if (t2 >= 0 && t2 <= 1) {
        return {
            x: x1 + t2 * dx,
            y: y1 + t2 * dy,
            dist: t2 * sqrt(a)
        };
    }
    
    return null;
}


function calculateDeflectionPaths(hitInfo) {
    // Calculate where cue ball and target ball will go after collision
    var cueVelX = cos(cue.angle);
    var cueVelY = sin(cue.angle);
    
    var targetX = hitInfo.ball.position.x;
    var targetY = hitInfo.ball.position.y;
    var hitX = hitInfo.hitX;
    var hitY = hitInfo.hitY;
    
    // Direction from cue ball hit point to target ball center
    var toTargetX = targetX - hitX;
    var toTargetY = targetY - hitY;
    var toTargetLen = sqrt(toTargetX * toTargetX + toTargetY * toTargetY);
    toTargetX /= toTargetLen;
    toTargetY /= toTargetLen;
    
    // Target ball goes in this direction
    trajectoryPreview.collisionBalls.push({
        startX: targetX,
        startY: targetY,
        dirX: toTargetX,
        dirY: toTargetY,
        color: hitInfo.color,
        length: 80
    });
    
    // Cue ball deflects (simplified - 90 degree deflection for center hit)
    // With spin, the deflection angle changes
    var spinEffect = spinControl.y * 0.3;  // top spin = less deflection, back spin = more
    
    var deflectAngle = atan2(toTargetY, toTargetX) + HALF_PI + spinEffect;
    trajectoryPreview.collisionBalls.push({
        startX: hitX,
        startY: hitY,
        dirX: cos(deflectAngle),
        dirY: sin(deflectAngle),
        color: BALL_COLORS.cue,
        length: 50
    });
}


function drawTrajectoryPreview() {
    push();
    
    // Draw main trajectory line with gradient
    if (trajectoryPreview.points.length > 1) {
        noFill();
        
        for (var i = 1; i < trajectoryPreview.points.length; i++) {
            var p1 = trajectoryPreview.points[i - 1];
            var p2 = trajectoryPreview.points[i];
            
            // Fade out over distance
            var alpha = map(i, 0, trajectoryPreview.points.length, 180, 30);
            
            // Different color for each bounce
            if (p1.bounce === 0) {
                stroke(255, 255, 255, alpha);
            } else if (p1.bounce === 1) {
                stroke(255, 200, 100, alpha);
            } else {
                stroke(255, 150, 80, alpha * 0.7);
            }
            
            strokeWeight(p1.bounce === 0 ? 2 : 1.5);
            
            // Dashed line effect
            if (i % 3 !== 0) {
                line(p1.x, p1.y, p2.x, p2.y);
            }
        }
    }
    
    // Draw ghost ball at collision point
    if (trajectoryPreview.ghostBall) {
        var ghost = trajectoryPreview.ghostBall;
        
        // Ghost cue ball position
        noFill();
        stroke(255, 255, 255, 150);
        strokeWeight(2);
        ellipse(ghost.x, ghost.y, ballDiameter);
        
        // Highlight on target ball
        stroke(255, 255, 100, 200);
        strokeWeight(3);
        noFill();
        ellipse(ghost.targetBall.position.x, ghost.targetBall.position.y, ballDiameter + 6);
        
        // Draw deflection paths
        for (var i = 0; i < trajectoryPreview.collisionBalls.length; i++) {
            var path = trajectoryPreview.collisionBalls[i];
            
            var c = color(path.color);
            c.setAlpha(120);
            stroke(c);
            strokeWeight(2);
            
            // Draw arrow
            var endX = path.startX + path.dirX * path.length;
            var endY = path.startY + path.dirY * path.length;
            
            drawingContext.setLineDash([4, 4]);
            line(path.startX, path.startY, endX, endY);
            drawingContext.setLineDash([]);
            
            // Arrowhead
            var arrowSize = 8;
            var angle = atan2(path.dirY, path.dirX);
            fill(c);
            noStroke();
            triangle(
                endX, endY,
                endX - cos(angle - 0.4) * arrowSize,
                endY - sin(angle - 0.4) * arrowSize,
                endX - cos(angle + 0.4) * arrowSize,
                endY - sin(angle + 0.4) * arrowSize
            );
        }
    }
    
    pop();
}


// ------------------------------------------
// SLOW MOTION REPLAY SYSTEM
// ------------------------------------------

function startRecording() {
    replaySystem.recording = true;
    replaySystem.frames = [];
}


function stopRecording() {
    replaySystem.recording = false;
}


function recordReplayFrame() {
    if (replaySystem.frames.length >= replaySystem.maxFrames) {
        replaySystem.frames.shift();  // remove oldest frame
    }
    
    // Capture current state
    var frame = {
        cueBall: cueBall ? { x: cueBall.position.x, y: cueBall.position.y } : null,
        redBalls: [],
        colouredBalls: {}
    };
    
    for (var i = 0; i < redBalls.length; i++) {
        frame.redBalls.push({
            x: redBalls[i].position.x,
            y: redBalls[i].position.y
        });
    }
    
    for (var colour in colouredBalls) {
        if (colouredBalls[colour]) {
            frame.colouredBalls[colour] = {
                x: colouredBalls[colour].position.x,
                y: colouredBalls[colour].position.y
            };
        }
    }
    
    replaySystem.frames.push(frame);
}


function drawReplayFrame() {
    // Draw table
    drawTable();
    
    if (replaySystem.frames.length === 0) {
        replaySystem.showReplay = false;
        return;
    }
    
    // Get current frame (with interpolation for smooth playback)
    var frameIndex = floor(replaySystem.playbackIndex);
    var frame = replaySystem.frames[min(frameIndex, replaySystem.frames.length - 1)];
    
    // Draw balls at recorded positions
    if (frame.cueBall) {
        drawSingleBall(frame.cueBall.x, frame.cueBall.y, BALL_COLORS.cue);
    }
    
    for (var i = 0; i < frame.redBalls.length; i++) {
        drawSingleBall(frame.redBalls[i].x, frame.redBalls[i].y, BALL_COLORS.red);
    }
    
    for (var colour in frame.colouredBalls) {
        var pos = frame.colouredBalls[colour];
        drawSingleBall(pos.x, pos.y, BALL_COLORS[colour]);
    }
    
    // Advance playback
    replaySystem.playbackIndex += replaySystem.playbackSpeed;
    
    // Replay overlay
    push();
    fill(0, 0, 0, 100);
    noStroke();
    rect(0, 0, width, 40);
    
    fill(255, 100, 100);
    textSize(16);
    textAlign(CENTER, CENTER);
    text("SLOW MOTION REPLAY", width / 2, 20);
    
    // Progress bar
    var progress = replaySystem.playbackIndex / replaySystem.frames.length;
    fill(50);
    rect(width / 4, 30, width / 2, 5, 2);
    fill(255, 100, 100);
    rect(width / 4, 30, (width / 2) * progress, 5, 2);
    
    pop();
    
    // End replay
    if (replaySystem.playbackIndex >= replaySystem.frames.length) {
        replaySystem.showReplay = false;
        replaySystem.playbackIndex = 0;
    }
}


function toggleReplay() {
    if (replaySystem.frames.length > 0 && !isShooting) {
        replaySystem.showReplay = !replaySystem.showReplay;
        replaySystem.playbackIndex = 0;
    }
}


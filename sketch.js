// ============================================
// SNOOKER GAME - Using P5.js and Matter.js
// ============================================

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
    x: 0,
    y: 0,
    angle: 0,
    length: 250,
    visible: false
};

// ------------------------------------------
// GAME MODE
// 1 = Standard formation
// 2 = Random clusters
// 3 = Practice mode
// ------------------------------------------
var currentMode = 1;

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
    
    // Initialize ball spots
    initBallSpots();
    
    // Create the balls
    createBalls();
    
    // Create table boundaries (cushions as physics bodies)
    createCushionBodies();
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
    // Create cue ball
    createCueBall();
    
    // Create coloured balls at their spots
    createColouredBalls();
    
    // Create red balls based on current mode
    createRedBallsByMode(currentMode);
}


function createCueBall() {
    var ballOptions = {
        friction: 0.02,
        restitution: 0.9,
        frictionAir: 0.015,
        label: 'cueBall'
    };
    
    cueBall = Bodies.circle(
        spotPositions.cueBall.x,
        spotPositions.cueBall.y,
        ballRadius,
        ballOptions
    );
    World.add(world, cueBall);
}


function createColouredBalls() {
    var ballOptions = {
        friction: 0.02,
        restitution: 0.9,
        frictionAir: 0.015
    };
    
    for (var colour in colouredBalls) {
        var pos = spotPositions[colour];
        colouredBalls[colour] = Bodies.circle(
            pos.x,
            pos.y,
            ballRadius,
            { ...ballOptions, label: colour }
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
    
    var ballOptions = {
        friction: 0.02,
        restitution: 0.9,
        frictionAir: 0.015,
        label: 'red'
    };
    
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
                ballOptions
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
    
    var ballOptions = {
        friction: 0.02,
        restitution: 0.9,
        frictionAir: 0.015,
        label: 'red'
    };
    
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
            
            var redBall = Bodies.circle(ballX, ballY, ballRadius, ballOptions);
            redBalls.push(redBall);
            World.add(world, redBall);
        }
    }
}


function createPracticeReds() {
    // Mode 3: Practice mode - spread reds across the table
    // Useful for practicing different shot angles
    
    var ballOptions = {
        friction: 0.02,
        restitution: 0.9,
        frictionAir: 0.015,
        label: 'red'
    };
    
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
                var redBall = Bodies.circle(ballX, ballY, ballRadius, ballOptions);
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
            var redBall = Bodies.circle(randX, randY, ballRadius, ballOptions);
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
    }
    
    for (var colour in colouredBalls) {
        if (colouredBalls[colour]) {
            World.remove(world, colouredBalls[colour]);
        }
    }
    
    // Recreate all balls
    createCueBall();
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
}


function createCushionBodies() {
    // Create static bodies for cushions (collision boundaries)
    var cushionOptions = {
        isStatic: true,
        restitution: 0.8,
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
    
    // Update physics
    Engine.update(engine);
    
    // Draw the table
    drawTable();
    
    // Draw all balls
    drawBalls();
    
    // Draw mode indicator
    drawModeIndicator();
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
    
    // Instructions
    fill('#AAAAAA');
    textSize(11);
    text("Press 1, 2, or 3 to change mode", 15, 35);
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
    // Draw cue ball
    drawSingleBall(cueBall.position.x, cueBall.position.y, BALL_COLORS.cue);
    
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


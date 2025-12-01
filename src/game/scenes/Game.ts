import Phaser from 'phaser';
import { EventBus } from '../EventBus';

export type Difficulty = 'easy' | 'medium' | 'hard';
type GameState = 'ready' | 'playing' | 'gameover';

interface DifficultySettings
{
    gap: number;
    spawnDelay: number;
    speed: number;
}

export class Game extends Phaser.Scene
{
    private bird!: Phaser.Physics.Arcade.Sprite;
    private pipes!: Phaser.Physics.Arcade.Group;
    private scoreText!: Phaser.GameObjects.Text;
    private instructionText!: Phaser.GameObjects.Text;
    private gameOverText!: Phaser.GameObjects.Text;
    private flapKey?: Phaser.Input.Keyboard.Key;
    private score = 0;
    private best = 0;
    private state: GameState = 'ready';
    private spawnTimer?: Phaser.Time.TimerEvent;
    private readyWave = 0;
    private playBounds!: Phaser.Geom.Rectangle;
    private readonly hudTop = 90;
    private readonly hudBottom = 95;
    private readonly spawnPadding = 70;

    private readonly difficultySettings: Record<Difficulty, DifficultySettings> = {
        easy: { gap: 280, spawnDelay: 1900, speed: -190 },
        medium: { gap: 220, spawnDelay: 1650, speed: -220 },
        hard: { gap: 170, spawnDelay: 1350, speed: -255 }
    };
    private difficulty: Difficulty = 'medium';
    private pipeSpeed = this.difficultySettings[this.difficulty].speed;
    private gapSize = this.difficultySettings[this.difficulty].gap;
    private spawnDelay = this.difficultySettings[this.difficulty].spawnDelay;

    constructor ()
    {
        super('Game');
    }

    preload ()
    {
        this.load.setPath('assets');
        this.load.image('background', 'bg.png');
    }

    create ()
    {
        const { width, height } = this.scale;
        const playHeight = height - this.hudTop - this.hudBottom;
        const playCenterY = this.hudTop + (playHeight * 0.5);

        this.playBounds = new Phaser.Geom.Rectangle(0, this.hudTop, width, playHeight);

        this.add.image(width * 0.5, height * 0.5, 'background').setDisplaySize(width, height);
        this.add.rectangle(width * 0.5, this.hudTop * 0.5, width, this.hudTop, 0x031b2b, 0.75).setDepth(5);
        this.add.rectangle(width * 0.5, height - (this.hudBottom * 0.5), width, this.hudBottom, 0x031b2b, 0.75).setDepth(5);
        this.generatePipeTexture();
        this.generateBirdTexture();

        this.pipes = this.physics.add.group({ allowGravity: false, immovable: true });

        this.bird = this.physics.add.sprite(width * 0.35, playCenterY, 'bird');
        this.bird.setScale(0.95);
        this.bird.setCollideWorldBounds(true);
        const body = this.bird.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false);
        body.onWorldBounds = true;

        this.physics.world.setBounds(this.playBounds.x, this.playBounds.y, this.playBounds.width, this.playBounds.height);
        this.physics.add.collider(this.bird, this.pipes, this.onBirdHit, undefined, this);
        this.physics.world.on('worldbounds', this.handleWorldBounds, this);

        this.scoreText = this.add.text(width * 0.5, this.hudTop * 0.5, '', {
            fontFamily: 'Arial Black',
            fontSize: '32px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6
        }).setOrigin(0.5).setDepth(10);

        this.instructionText = this.add.text(width * 0.5, height - (this.hudBottom * 0.5), '', {
            fontFamily: 'Arial Black',
            fontSize: '24px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5).setDepth(10);

        this.gameOverText = this.add.text(width * 0.5, playCenterY, 'Game Over\nClick to try again', {
            fontFamily: 'Arial Black',
            fontSize: '48px',
            align: 'center',
            color: '#ffeb3b',
            stroke: '#000000',
            strokeThickness: 8
        }).setOrigin(0.5).setDepth(30).setVisible(false);

        this.input.on('pointerdown', this.handleFlap, this);
        this.flapKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.flapKey?.on('down', this.handleFlap, this);

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
        {
            this.input.off('pointerdown', this.handleFlap, this);
            this.flapKey?.off('down', this.handleFlap, this);
            this.physics.world.off('worldbounds', this.handleWorldBounds, this);
        });

        this.resetScene();

        EventBus.emit('current-scene-ready', this);
    }

    update (_time: number, delta: number)
    {
        if (this.state === 'ready')
        {
            this.readyWave += delta * 0.005;
            this.bird.y = this.getPlayCenterY() + Math.sin(this.readyWave) * 12;
            return;
        }

        if (this.state !== 'playing')
        {
            return;
        }

        this.updateBirdAngle();
        this.managePipes();
    }

    public triggerFlapFromUI ()
    {
        this.handleFlap();
    }

    public setDifficulty (level: Difficulty)
    {
        if (!this.difficultySettings[level] || this.difficulty === level)
        {
            return;
        }

        this.difficulty = level;
        const settings = this.difficultySettings[level];
        this.pipeSpeed = settings.speed;
        this.gapSize = settings.gap;
        this.spawnDelay = settings.spawnDelay;

        this.resetScene();
    }

    private handleFlap = () =>
    {
        if (this.state === 'gameover')
        {
            this.resetScene();
            this.startRun();
        }
        else if (this.state === 'ready')
        {
            this.startRun();
        }

        if (this.state !== 'playing')
        {
            return;
        }

        this.bird.setVelocityY(-320);
    };

    private startRun ()
    {
        this.state = 'playing';
        this.instructionText.setVisible(false);
        const body = this.bird.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(true);
        this.spawnTimer = this.time.addEvent({
            delay: this.spawnDelay,
            loop: true,
            callback: this.spawnPipes,
            callbackScope: this
        });
        this.spawnPipes();
    }

    private resetScene ()
    {
        this.state = 'ready';
        this.score = 0;
        this.readyWave = 0;
        this.updateScoreboard();
        this.updateInstructionText();
        this.instructionText.setVisible(true);
        this.gameOverText.setVisible(false);
        this.spawnTimer?.remove(false);
        this.pipes.clear(true, true);
        this.bird.clearTint();
        this.bird.setPosition(this.scale.width * 0.35, this.getPlayCenterY());
        this.bird.setVelocity(0, 0);
        this.bird.setAngle(0);
        (this.bird.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    }

    private spawnPipes ()
    {
        if (this.state !== 'playing')
        {
            return;
        }

        const { width } = this.scale;
        const minY = this.playBounds.y + this.spawnPadding;
        const maxY = this.playBounds.bottom - this.spawnPadding;
        const centerY = Phaser.Math.Between(minY, maxY);
        const pipeX = width + 80;

        const topPipe = this.createPipe(pipeX, centerY - (this.gapSize * 0.5), true);
        topPipe.setData('isTop', true);
        topPipe.setData('scored', false);

        this.createPipe(pipeX, centerY + (this.gapSize * 0.5), false);
    }

    private createPipe (x: number, y: number, isTop: boolean)
    {
        const pipe = this.pipes.create(x, y, 'pipe') as Phaser.Physics.Arcade.Image;
        pipe.setOrigin(0.5, isTop ? 1 : 0);
        pipe.setFlipY(isTop);
        
        const body = pipe.body as Phaser.Physics.Arcade.Body;

        body.setAllowGravity(false);
        body.setVelocityX(this.pipeSpeed);
        body.setImmovable(true);
        pipe.setData('isTop', isTop);
        pipe.setData('scored', false);
        return pipe;
    }

    private managePipes ()
    {
        this.pipes.children.each((child) =>
        {
            const pipe = child as Phaser.Physics.Arcade.Image;
            const rightEdge = pipe.x + (pipe.displayWidth * 0.5);

            if (rightEdge < -20)
            {
                this.pipes.remove(pipe, true, true);
                return;
            }

            const isTop = pipe.getData('isTop') === true;
            const scored = pipe.getData('scored') === true;

            if (this.state === 'playing' && isTop && !scored && rightEdge < this.bird.x)
            {
                pipe.setData('scored', true);
                this.incrementScore();
            }
        });
    }

    private updateBirdAngle ()
    {
        const velocityY = (this.bird.body as Phaser.Physics.Arcade.Body).velocity.y;
        const angle = Phaser.Math.Clamp(velocityY / 5, -25, 60);
        this.bird.setAngle(angle);
    }

    private incrementScore ()
    {
        this.score += 1;
        if (this.score > this.best)
        {
            this.best = this.score;
        }
        this.updateScoreboard();
    }

    private updateScoreboard ()
    {
        if (!this.scoreText)
        {
            return;
        }

        this.scoreText.setText(`Score: ${this.score}  Best: ${this.best}  ${this.difficulty.toUpperCase()}`);
    }

    private updateInstructionText ()
    {
        if (!this.instructionText)
        {
            return;
        }

        this.instructionText.setText(`Tap or press SPACE to flap\nDifficulty: ${this.difficulty.toUpperCase()}`);
    }

    private handleWorldBounds = (body: Phaser.Physics.Arcade.Body) =>
    {
        if (body.gameObject === this.bird)
        {
            this.onBirdHit();
        }
    };

    private onBirdHit = () =>
    {
        if (this.state !== 'playing')
        {
            return;
        }

        this.state = 'gameover';
        this.spawnTimer?.remove(false);
        this.gameOverText.setVisible(true);
        this.bird.setTint(0xff1744);
        this.bird.setAngle(60);

        this.pipes.children.each((child) =>
        {
            const body = (child as Phaser.Physics.Arcade.Image).body as Phaser.Physics.Arcade.Body;
            body.setVelocityX(0);
        });
    };

    private getPlayCenterY ()
    {
        return this.playBounds.y + (this.playBounds.height * 0.5);
    }

    private generatePipeTexture ()
    {
        if (this.textures.exists('pipe'))
        {
            return;
        }

        const width = 90;
        const height = 400;
        const graphics = this.make.graphics({ x: 0, y: 0 });
        graphics.fillStyle(0x2eb872, 1);
        graphics.fillRoundedRect(0, 0, width, height, 18);
        graphics.lineStyle(8, 0x0c7438, 1);
        graphics.strokeRoundedRect(0, 0, width, height, 18);
        graphics.generateTexture('pipe', width, height);
        graphics.destroy();
    }

    private generateBirdTexture ()
    {
        if (this.textures.exists('bird'))
        {
            return;
        }

        const width = 96;
        const height = 72;
        const graphics = this.make.graphics({ x: 0, y: 0 });

        graphics.fillStyle(0xffd86b, 1);
        graphics.fillEllipse(width * 0.45, height * 0.55, width * 0.7, height * 0.7);

        graphics.fillStyle(0xf6a742, 1);
        graphics.fillEllipse(width * 0.35, height * 0.52, width * 0.5, height * 0.35);

        graphics.fillStyle(0xfff8d7, 1);
        graphics.fillEllipse(width * 0.53, height * 0.58, width * 0.4, height * 0.3);

        graphics.fillStyle(0xe36414, 1);
        graphics.fillTriangle(width * 0.78, height * 0.47, width * 0.96, height * 0.53, width * 0.78, height * 0.59);

        graphics.fillStyle(0xffd86b, 1);
        graphics.fillRoundedRect(width * 0.08, height * 0.5, width * 0.18, height * 0.18, 16);

        graphics.fillStyle(0x000000, 1);
        graphics.fillCircle(width * 0.63, height * 0.38, 7);
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(width * 0.66, height * 0.36, 3);

        graphics.generateTexture('bird', width, height);
        graphics.destroy();
    }
}

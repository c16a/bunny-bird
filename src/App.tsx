import { useCallback, useEffect, useState } from 'react';
import { PhaserGame } from './PhaserGame';
import type Phaser from 'phaser';
import type { Game as GameScene, Difficulty } from './game/scenes/Game';

const difficultyOrder: Difficulty[] = ['easy', 'medium', 'hard'];
const difficultyLabels: Record<Difficulty, string> = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard'
};
const difficultyDescriptions: Record<Difficulty, string> = {
    easy: 'Wider gaps and slower pipes make this mode perfect for warming up.',
    medium: 'Balanced spacing keeps the challenge steady as you learn the rhythm.',
    hard: 'Tight gaps and faster pipes demand precise timing—good luck!'
};

function App()
{
    const [activeScene, setActiveScene] = useState<GameScene | null>(null);
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');

    const handleSceneReady = useCallback((sceneInstance: Phaser.Scene) =>
    {
        const scene = sceneInstance as GameScene;
        setActiveScene(scene);
        scene.setDifficulty(difficulty);
    }, [difficulty]);

    const changeDifficulty = useCallback((level: Difficulty) =>
    {
        setDifficulty(level);
        activeScene?.setDifficulty(level);
    }, [activeScene]);

    useEffect(() =>
    {
        if (!activeScene)
        {
            return;
        }

        const handleTouch = (event: TouchEvent) =>
        {
            const container = document.getElementById('game-container');
            if (!container || !event.target)
            {
                return;
            }

            if (!(event.target instanceof Node))
            {
                return;
            }

            if (container.contains(event.target))
            {
                event.preventDefault();
                activeScene.triggerFlapFromUI();
            }
        };

        window.addEventListener('touchstart', handleTouch, { passive: false });

        return () =>
        {
            window.removeEventListener('touchstart', handleTouch);
        };
    }, [activeScene]);

    return (
        <div id="app">
            <PhaserGame currentActiveScene={handleSceneReady} />
            <div className="info-panel">
                <p>Guide the bunny-themed bird through endless pipes.</p>
                <p>Tap anywhere on the game canvas (or press SPACE) to flap. Rotate your device to landscape for more room.</p>
                <p>Your best score is tracked locally each session.</p>
                <div className="difficulty-controls">
                    <span>Difficulty:</span>
                    <div className="difficulty-buttons">
                        {difficultyOrder.map((value) => (
                            <button
                                key={value}
                                type="button"
                                className={value === difficulty ? 'active' : ''}
                                onClick={() => changeDifficulty(value)}
                                disabled={!activeScene}
                            >
                                {difficultyLabels[value]}
                            </button>
                        ))}
                    </div>
                    <small>{difficultyDescriptions[difficulty]}</small>
                </div>
            </div>
        </div>
    )
}

export default App

import { useCallback, useEffect, useState } from 'react';
import { PhaserGame } from './PhaserGame';
import type Phaser from 'phaser';
import type { Game as GameScene } from './game/scenes/Game';

function App()
{
    const [activeScene, setActiveScene] = useState<GameScene | null>(null);

    const handleSceneReady = useCallback((sceneInstance: Phaser.Scene) =>
    {
        setActiveScene(sceneInstance as GameScene);
    }, []);

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
        </div>
    )
}

export default App

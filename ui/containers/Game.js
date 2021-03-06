import amplitude from 'amplitude-js';
import qs from 'query-string';
import React, { Component } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import Modal from 'react-modal';
import { withRouter } from 'react-router';
import { Link } from 'react-router-dom';
import { Tooltip } from 'react-tippy';

import GameBoard from './GameBoard.js';
import SpeedIcon from './SpeedIcon.js';
import UserDisplay from './UserDisplay.js';
import GameState from '../util/GameState.js';

class Game extends Component {

    constructor(props) {
        super(props);

        const gameId = props.match.params.gameId;

        const { key } = qs.parse(props.location.search);
        const playerKey = props.playerKey || key;

        const gameState = new GameState(gameId, playerKey, props.fetchUserInfo, () => {
            this.props.history.push('/');
        }, (oldRating, newRating) => {
            this.setState({ oldRating, newRating });
        });

        this.state = {
            gameState,

            modalType: null,
            showReady: true,
            inviteUsername: '',

            game: null,
            player: null,
            isReady: false,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,

            oldRating: null,
            newRating: null,

            musicVolume: (window.localStorage && window.localStorage.musicVolume) || 0,
            soundVolume: (window.localStorage && window.localStorage.soundVolume) || 0,
        };

        this.resize = this.resize.bind(this);
        this.update = this.update.bind(this);
        this.closeModal = this.closeModal.bind(this);

        this.music = null;
        this.captureSounds = [];
        this.finishSound = null;
    }

    componentWillMount() {
        const { gameState } = this.state;

        // listen for updates
        gameState.registerListener(this.update);

        // listen for resizes
        window.addEventListener('resize', this.resize);
    }

    componentDidMount() {
        const { gameState } = this.state;
        const { user } = this.props;

        if (user) {
            this.props.checkGame(gameState.gameId);
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.resize);

        if (this.state.gameState) {
            this.state.gameState.unregisterListener(this.update);
            this.state.gameState.destroy();
        }
    }

    resize() {
        this.setState({
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
        });
    }

    update(gameState, updates) {
        const { soundVolume } = this.state;
        const { playerKeys } = this.props;

        let modalType = this.state.modalType;
        let showReady = this.state.showReady;
        if (gameState.game) {
            // various modal triggers
            if (modalType === null && gameState.game.finished) {
                amplitude.getInstance().logEvent('Finish Game', {
                    gameId: gameState.gameId,
                    player: gameState.player,
                    won: (gameState.game.finished === gameState.player),
                });

                if (this.finishSound) {
                    this.finishSound.volume = soundVolume / 100;
                    this.finishSound.play();
                }

                modalType = 'game-finished';
            } else if (modalType === 'game-finished' && !gameState.game.finished) {
                modalType = null;
            } else if (modalType === 'ready' && gameState.game.started) {
                amplitude.getInstance().logEvent('Start Game', {
                    gameId: gameState.gameId,
                    player: gameState.player,
                });

                modalType = null;
            }

            if (!gameState.game.started && gameState.player !== 0) {
                modalType = 'ready';
                showReady = (
                    playerKeys === null || !('2' in playerKeys) ||
                    !(Object.values(gameState.game.players).includes('o')) ||
                    gameState.game.playersReady['1'] || gameState.game.playersReady['2']
                );
            }
        }

        const hasCapture = updates && updates.some(u => u.type === 'capture');
        if (hasCapture && this.captureSounds.length > 0) {
            const soundIndex = Math.floor(Math.random() * this.captureSounds.length);
            const randomSound = this.captureSounds[soundIndex];
            randomSound.volume = soundVolume / 100;
            randomSound.play();
        }

        this.setState({
            modalType,
            showReady,
            game: gameState.game,
            player: gameState.player,
            isReady: gameState.isReady(),
        });
    }

    closeModal() {
        this.setState({
            modalType: null,
        });
    }

    inviteUser() {
        const { gameState, inviteUsername } = this.state;

        this.props.inviteUser(gameState.gameId, inviteUsername, () => {
            this.setState({ showReady: true });
        });
    }

    changeDifficulty(difficulty) {
        const { gameState } = this.state;

        amplitude.getInstance().logEvent('Change AI Difficulty', {
            gameId: gameState.gameId,
            difficulty,
        });
        gameState.changeDifficulty(2, difficulty);
    }

    render () {
        const {
            gameState,
            modalType,
            showReady,
            inviteUsername,
            game,
            player,
            isReady,
            windowWidth,
            windowHeight,
            musicVolume,
            soundVolume,
        } = this.state;

        const { knownUsers, playerKeys } = this.props;

        const baseUrl = `${window.location.origin}${window.location.pathname}`;

        let started = false;
        if (game) {
            started = game.started;
        }

        let friendLink = null;
        if (playerKeys && '2' in playerKeys) {
            friendLink = `${baseUrl}?key=${playerKeys['2']}`;
        }

        let invited = false;
        if (player === 1 && game.players['2'] && game.players['2'].startsWith('u:')) {
            invited = true;
        }

        let difficulty = null;
        if (player === 1 && game.players['2'] && game.players['2'].startsWith('b')) {
            difficulty = game.players['2'].substring(2);
        }

        let endGameText = null;
        if (game && game.finished) {
            if (gameState.player === 0) {
                if (game.finished === 1) {
                    endGameText = 'White wins!';
                } else if (game.finished === 2) {
                    endGameText = 'Black wins!';
                } else {
                    endGameText = 'Draw!';
                }
            } else if (game.finished === gameState.player) {
                endGameText = 'You win!';
            } else if (game.finished === -1) {
                endGameText = 'Draw!';
            } else {
                endGameText = 'You lost!';
            }
        }

        let readyText = 'Waiting for opponent...';
        let readyAction = null;
        if (player === 0) {
            readyText = 'Waiting for players...';
        } else if (!isReady) {
            readyText = 'I\'m ready!';
            readyAction = 'ready';
        }

        if (game && game.started) {
            readyText = 'Game started!';
        }
        if (game && game.finished) {
            if (player == 0) {
                readyText = endGameText;
            } else {
                readyText = 'Play Again';
                readyAction = 'play-again';
            }
        }

        const isPortrait = windowHeight > 1.5 * windowWidth;

        if (this.music) {
            if (game && game.started && !game.finished) {
                this.music.play();
            } else {
                this.music.pause();
                this.music.currentTime = 0;
            }
        }

        return game ?
            <div className='game'>
                {this.renderModal(
                    gameState,
                    player,
                    modalType,
                    showReady,
                    inviteUsername,
                    friendLink,
                    invited,
                    difficulty,
                    readyText,
                    readyAction,
                    endGameText,
                )}
                <div className='game-content'>
                    {this.renderAudio()}
                    <div className='game-board'>
                        <GameBoard gameState={gameState} />
                    </div>
                    <div className='game-meta'>
                        <div>
                            <div className='game-meta-section game-ready-section'>
                                <div
                                    className={`game-ready-button ${readyAction ? 'clickable' : ''}`}
                                    onClick={() => {
                                        if (readyAction === 'ready') {
                                            amplitude.getInstance().logEvent('Click Ready', {
                                                source: 'sidebar',
                                                player,
                                                gameId: gameState.gameId,
                                            });

                                            gameState.ready();
                                        } else if (readyAction === 'play-again') {
                                            amplitude.getInstance().logEvent('Click Play Again', {
                                                source: 'sidebar',
                                                player,
                                                gameId: gameState.gameId,
                                            });

                                            gameState.reset();
                                        }
                                    }}
                                >
                                    {readyText}
                                </div>
                                {(player !== 0 && (!game.started || game.finished !== 0)) &&
                                    <div
                                        className='game-cancel-button'
                                        onClick={() => {
                                            amplitude.getInstance().logEvent('Cancel Game', {
                                                source: 'sidebar',
                                                player,
                                                gameId: gameState.gameId,
                                            });

                                            gameState.cancel();
                                        }}
                                    >
                                        Cancel Game
                                    </div>
                                }
                            </div>
                            <div className='game-meta-section'>
                                <div className='game-id'>
                                    Game ID: {gameState.gameId}
                                </div>
                            </div>
                            <div className='game-meta-section'>
                                <Tooltip
                                    title='Copied to clipboard!'
                                    distance={5}
                                    trigger='click'
                                >
                                    <CopyToClipboard
                                        text={baseUrl}
                                        onCopy={() => {
                                            amplitude.getInstance().logEvent('Copy Spectator Link', {
                                                source: 'sidebar',
                                                gameId: gameState.gameId,
                                                player,
                                            });
                                        }}
                                    >
                                        <div className='game-friend-link'>
                                            <div className='game-friend-link-text'>
                                                Copy spectator link
                                            </div>
                                            <div className='game-friend-link-icon'>
                                                <i className='fas fa-link' />
                                            </div>
                                        </div>
                                    </CopyToClipboard>
                                </Tooltip>
                            </div>
                            <div className='game-meta-section game-meta-players'>
                                <table>
                                    <tbody>
                                        <tr className='game-meta-player'>
                                            <td className='game-meta-player-color'>White:</td>
                                            <td><UserDisplay value={game.players[1]} knownUsers={knownUsers} /></td>
                                        </tr>
                                        <tr className='game-meta-player'>
                                            <td className='game-meta-player-color'>Black:</td>
                                            <td><UserDisplay value={game.players[2]} knownUsers={knownUsers} /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className='game-audio-controls'>
                            <table>
                                <tbody>
                                    <tr className='game-audio-control'>
                                        <td className='game-audio-control-label'>Music:</td>
                                        <td>
                                            <input
                                                className='game-music-volume'
                                                type='range'
                                                min='0'
                                                max='100'
                                                value={musicVolume}
                                                onChange={() => {}}
                                                onInput={e => {
                                                    amplitude.getInstance().logEvent('Change Volume', {
                                                        source: 'game',
                                                        type: 'music',
                                                        volume: e.target.value,
                                                    });

                                                    this.setState({ musicVolume : e.target.value });
                                                    if (window.localStorage) {
                                                        window.localStorage.musicVolume = e.target.value;
                                                    }
                                                }}
                                            />
                                        </td>
                                    </tr>
                                    <tr className='game-audio-control'>
                                        <td className='game-audio-control-label'>Sound:</td>
                                        <td>
                                            <input
                                                className='game-sound-volume'
                                                type='range'
                                                min='0'
                                                max='100'
                                                value={soundVolume}
                                                onChange={() => {}}
                                                onInput={e => {
                                                    amplitude.getInstance().logEvent('Change Volume', {
                                                        source: 'game',
                                                        type: 'sound',
                                                        volume: e.target.value,
                                                    });

                                                    this.setState({ soundVolume : e.target.value });
                                                    if (window.localStorage) {
                                                        window.localStorage.soundVolume = e.target.value;
                                                    }
                                                }}
                                            />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                {isPortrait &&
                    <div className='game-portrait-warning'>
                        Your browser appears to be in portrait mode.<br/>
                        Rotate for a better experience!
                    </div>
                }
            </div>
            :
            null;
    }

    renderAudio() {
        const { musicVolume } = this.state;

        return (
            <div>
                <audio
                    ref={music => {
                        this.music = music;
                        if (this.music) {
                            this.music.volume = musicVolume / 100;
                        }
                    }}
                    loop
                >
                    <source src='/static/kfchess-music.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[0] = sound}>
                    <source src='/static/kfchess-sound1.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[1] = sound}>
                    <source src='/static/kfchess-sound2.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[2] = sound}>
                    <source src='/static/kfchess-sound3.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[3] = sound}>
                    <source src='/static/kfchess-sound4.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[4] = sound}>
                    <source src='/static/kfchess-sound5.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[5] = sound}>
                    <source src='/static/kfchess-sound6.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[6] = sound}>
                    <source src='/static/kfchess-sound7.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.captureSounds[7] = sound}>
                    <source src='/static/kfchess-sound8.mp3' type='audio/mp3' />
                </audio>
                <audio ref={sound => this.finishSound = sound}>
                    <source src='/static/kfchess-gong.mp3' type='audio/mp3' />
                </audio>
            </div>
        );
    }

    renderModal(
        gameState,
        player,
        modalType,
        showReady,
        inviteUsername,
        friendLink,
        invited,
        difficulty,
        readyText,
        readyAction,
        endGameText
    ) {
        const { oldRating, newRating } = this.state;
        const { user, knownUsers } = this.props;

        return (
            <Modal
                isOpen={Boolean(modalType)}
                onRequestClose={this.closeModal}
                shouldCloseOnOverlayClick={modalType !== 'ready'}
                shouldCloseOnEsc={modalType !== 'ready'}
                className='game-modal'
                closeTimeoutMS={200}
            >
                {modalType === 'ready' &&
                    <div className='game-ready'>
                        {this.renderReadyTitle(gameState.game)}
                        {friendLink && !invited &&
                            <Tooltip
                                title='Copied to clipboard!'
                                distance={5}
                                trigger='click'
                            >
                                <CopyToClipboard
                                    text={friendLink}
                                    onCopy={() => {
                                        amplitude.getInstance().logEvent('Copy Friend Link', {
                                            source: 'modal',
                                            player,
                                            gameId: gameState.gameId,
                                        });

                                        this.setState({
                                            showReady: true,
                                        });
                                    }}
                                >
                                    <div className='game-friend-link'>
                                        <div className='game-friend-link-text'>
                                            Click to copy link and send to friend!
                                        </div>
                                        <div className='game-friend-link-icon'>
                                            <i className='fas fa-link' />
                                        </div>
                                    </div>
                                </CopyToClipboard>
                            </Tooltip>
                        }
                        {friendLink && !invited && user &&
                            <div className='game-invite'>
                                <input
                                    placeholder='... or invite by username'
                                    value={inviteUsername}
                                    maxLength={24}
                                    onChange={(e) => this.setState({ inviteUsername: e.target.value })}
                                    onKeyPress={(e) => e.key === 'Enter' && this.inviteUser()}
                                />
                                <div
                                    className='game-invite-submit'
                                    onClick={() => this.inviteUser()}
                                >
                                    <i className='far fa-paper-plane' />
                                </div>
                            </div>
                        }
                        {difficulty &&
                            <div className='game-difficulty-wrapper'>
                                <div
                                    className={`game-difficulty-option ${difficulty === 'novice' ? 'selected' : ''}`}
                                    onClick={() => this.changeDifficulty('novice')}
                                >
                                    Novice
                                </div>
                                <div
                                    className={`game-difficulty-option ${difficulty === 'intermediate' ? 'selected' : ''}`}
                                    onClick={() => this.changeDifficulty('intermediate')}
                                >
                                    Intermediate
                                </div>
                                <div
                                    className={`game-difficulty-option ${difficulty === 'advanced' ? 'selected' : ''}`}
                                    onClick={() => this.changeDifficulty('advanced')}
                                >
                                    Advanced
                                </div>
                            </div>
                        }
                        {showReady &&
                            <div
                                className={`game-ready-button ${readyAction ? 'clickable' : ''}`}
                                onClick={() => {
                                    if (readyAction === 'ready') {
                                        amplitude.getInstance().logEvent('Click Ready', {
                                            source: 'modal',
                                            player,
                                            gameId: gameState.gameId,
                                        });

                                        gameState.ready();
                                    }
                                }}
                            >
                                {readyText}
                            </div>
                        }
                        <div
                            className='game-cancel-button'
                            onClick={() => {
                                amplitude.getInstance().logEvent('Cancel Game', {
                                    source: 'modal',
                                    player,
                                    gameId: gameState.gameId,
                                });

                                gameState.cancel();
                            }}
                        >
                            Cancel
                        </div>
                    </div>
                }
                {modalType === 'game-finished' &&
                    <div className='game-finished'>
                        <div className='game-finished-text'>
                            {endGameText}
                        </div>
                        {oldRating &&
                            <div className='game-finished-rating'>
                                {`New rating: ${newRating} (${newRating >= oldRating ? '+' + (newRating - oldRating) : newRating - oldRating})`}
                            </div>
                        }
                        {player !== 0 &&
                            <div
                                className='game-finished-button-again'
                                onClick={() => {
                                    amplitude.getInstance().logEvent('Click Play Again', {
                                        source: 'modal',
                                        player,
                                        gameId: gameState.gameId,
                                    });

                                    gameState.reset();
                                }}
                            >
                                Play Again
                            </div>
                        }
                        {player !== 0 &&
                            <div
                                className='game-cancel-button'
                                onClick={() => {
                                    amplitude.getInstance().logEvent('Cancel Game', {
                                        source: 'modal',
                                        player,
                                        gameId: gameState.gameId,
                                    });

                                    gameState.cancel();
                                }}
                            >
                                Cancel
                            </div>
                        }
                    </div>
                }
            </Modal>
        );
    }

    renderReadyTitle(game) {
        const { knownUsers } = this.props;

        const rated = Object.values(game.players).every(v => v.startsWith('u:'));
        const players = Object.keys(game.players).sort();

        return (
            <div className='game-ready-text'>
                <div className='game-ready-text-speed'>
                    <SpeedIcon speed={game.speed} iconOnly={false} rated={rated} />
                </div>
                <div className='game-ready-text-players'>
                    {players.map((player, index) => {
                        const value = game.players[player];
                        if (index === 0) {
                            return (
                                <div className='game-ready-text-vs-player' key={index}>
                                    <UserDisplay value={value} knownUsers={knownUsers} />
                                </div>
                            );
                        }

                        return (
                            <div className='game-ready-text-vs-player' key={index}>
                                <div className='game-ready-text-vs'>vs</div>
                                <UserDisplay value={value} knownUsers={knownUsers} />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
};

export default withRouter(Game);

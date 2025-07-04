import React, { Component, Fragment } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import shortid from 'shortid';
import { resize } from 'mathjs';
import { isEqual } from 'lodash';
import { injectIntl, intlShape } from 'react-intl';
import isMobile from 'ismobilejs';
import domtoimage from 'dom-to-image';
import CircularProgress from '@material-ui/core/CircularProgress';
import Button from '@material-ui/core/Button';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogContentText from '@material-ui/core/DialogContentText';
import DialogTitle from '@material-ui/core/DialogTitle';
import Slide from '@material-ui/core/Slide';
import {
  showNotification,
  hideNotification
} from '../Notifications/Notifications.actions';
import { deactivateScanner } from '../../providers/ScannerProvider/ScannerProvider.actions';
import {
  speak,
  cancelSpeech
} from '../../providers/SpeechProvider/SpeechProvider.actions';
import { getTilesListForNewOrder, moveOrderItem } from '../FixedGrid/utils';
import {
  addBoards,
  changeBoard,
  replaceBoard,
  previousBoard,
  toRootBoard,
  createBoard,
  updateBoard,
  switchBoard,
  createTile,
  deleteTiles,
  editTiles,
  focusTile,
  clickSymbol,
  changeOutput,
  historyRemoveBoard,
  updateApiObjects,
  updateApiObjectsNoChild,
  getApiObjects,
  downloadImages,
  createApiBoard,
  upsertApiBoard,
  changeDefaultBoard
} from './Board.actions';
import {
  addBoardCommunicator,
  verifyAndUpsertCommunicator
} from '../Communicator/Communicator.actions';
import { disableTour } from '../App/App.actions';
import TileEditor from './TileEditor';
import messages from './Board.messages';
import Board from './Board.component';
import API from '../../api';
import {
  SCANNING_METHOD_AUTOMATIC,
  SCANNING_METHOD_MANUAL
} from '../Settings/Scanning/Scanning.constants';
import { NOTIFICATION_DELAY } from '../Notifications/Notifications.constants';
import { EMPTY_VOICES } from '../../providers/SpeechProvider/SpeechProvider.constants';
import { DEFAULT_ROWS_NUMBER, DEFAULT_COLUMNS_NUMBER } from './Board.constants';
import PremiumFeature from '../PremiumFeature';
import {
  IS_BROWSING_FROM_APPLE_TOUCH,
  IS_BROWSING_FROM_SAFARI
} from '../../constants';
import LoadingIcon from '../UI/LoadingIcon';
import { resolveTileLabel } from '../../helpers';
//import { isAndroid } from '../../cordova-util';

const ogv = require('ogv');
ogv.OGVLoader.base = process.env.PUBLIC_URL + '/ogv';

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export class BoardContainer extends Component {
  static propTypes = {
    /**
     * @ignore
     */
    intl: intlShape.isRequired,
    /**
     * Board history navigation stack
     */
    navHistory: PropTypes.arrayOf(PropTypes.string),
    /**
     * Board to display
     */
    board: PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      tiles: PropTypes.arrayOf(PropTypes.object)
    }),
    /**
     * Board output
     */
    output: PropTypes.arrayOf(
      PropTypes.shape({
        label: PropTypes.string,
        image: PropTypes.string,
        vocalization: PropTypes.string
      })
    ),
    /**
     * Add boards from API
     */
    addBoards: PropTypes.func,
    /**
     * Load board
     */
    changeBoard: PropTypes.func,
    /**
     * Load previous board
     */
    previousBoard: PropTypes.func,
    /**
     * Load root board
     */
    toRootBoard: PropTypes.func,
    historyRemoveBoard: PropTypes.func,
    /**
     * Create board
     */
    createBoard: PropTypes.func,
    updateBoard: PropTypes.func,
    /**
     * Create tile
     */
    createTile: PropTypes.func,
    /**
     * Edit tiles
     */
    editTiles: PropTypes.func,
    /**
     * Delete tiles
     */
    deleteTiles: PropTypes.func,
    /**
     * Focuses a board tile
     */
    focusTile: PropTypes.func,
    /**
     * Change output
     */
    changeOutput: PropTypes.func,
    /**
     * Show notification
     */
    showNotification: PropTypes.func,
    /**
     * Deactivate Scanner
     */
    deactivateScanner: PropTypes.func,
    /**
     * Show display Settings
     */
    displaySettings: PropTypes.object,
    /**
     * Show navigationSettings
     */
    navigationSettings: PropTypes.object,
    /**
     * Show userData
     */
    userData: PropTypes.object,
    /**
     * Scanner Settings
     */
    scannerSettings: PropTypes.object,
    /**
     * Adds a Board to the Active Communicator
     */
    addBoardCommunicator: PropTypes.func.isRequired,
    downloadImages: PropTypes.func,
    lang: PropTypes.string,
    isRootBoardTourEnabled: PropTypes.bool,
    disableTour: PropTypes.func,
    isLiveMode: PropTypes.bool,
    changeDefaultBoard: PropTypes.func
  };

  state = {
    selectedTileIds: [],
    isSaving: false,
    isSelectAll: false,
    isSelecting: false,
    isLocked: true,
    tileEditorOpen: false,
    isGettingApiObjects: false,
    copyPublicBoard: false,
    blockedPrivateBoard: false,
    isFixedBoard: false,
    copiedTiles: [],
    isScroll: false,
    totalRows: null,
    isCbuilderBoard: false
  };
  constructor(props) {
    super(props);
    this.boardRef = React.createRef();
  }

  async componentDidMount() {
    const {
      match: {
        params: { id }
      }
    } = this.props;

    const {
      board,
      boards,
      communicator,
      changeBoard,
      userData,
      history,
      getApiObjects
      //downloadImages
    } = this.props;

    // Loggedin user?
    if ('name' in userData && 'email' in userData && window.navigator.onLine) {
      //synchronize communicator and boards with API
      this.setState({ isGettingApiObjects: true });
      getApiObjects().then(() => this.setState({ isGettingApiObjects: false }));
    }

    let boardExists = null;

    if (id && board && id === board.id) {
      //active board = requested board, use that board
      boardExists = boards.find(b => b.id === board.id);
    } else if (id && board && id !== board.id) {
      //active board != requested board, use requested if exist otherwise use active
      boardExists = boards.find(b => b.id === id);
      if (!boardExists) {
        try {
          const remoteBoard = await this.tryRemoteBoard(id);
          if (remoteBoard) {
            boardExists = remoteBoard;
          } else {
            boardExists = boards.find(b => b.id === board.id);
          }
        } catch (err) {
          boardExists = boards.find(b => b.id === board.id);
        }
      }
    } else if (id && !board) {
      //no active board but requested board, use requested
      boardExists = boards.find(b => b.id === id);
      if (!boardExists) {
        try {
          boardExists = await this.tryRemoteBoard(id);
        } catch (err) {
          boardExists = null;
        }
      }
    } else if (!id && !!board) {
      //no requested board, use active board
      boardExists = boards.find(b => b.id === board.id);
    } else {
      //neither requested nor active board, use communicator root board
      boardExists = boards.find(b => b.id === communicator.rootBoard);
    }

    if (!boardExists) {
      // try the root board
      boardExists = boards.find(b => b.id === communicator.rootBoard);
      if (!boardExists) {
        boardExists = boards.find(b => b.id !== '');
      }
    }
    const boardId = boardExists.id;
    changeBoard(boardId);
    const goTo = id ? boardId : `board/${boardId}`;
    history.replace(goTo);

    //set board type
    this.setState({ isFixedBoard: !!boardExists.isFixed });

    // if (isAndroid()) downloadImages();
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.match.params.id !== nextProps.match.params.id) {
      const {
        navHistory,
        boards,
        changeBoard,
        previousBoard,
        historyRemoveBoard
      } = this.props;

      const boardExists = boards.find(b => b.id === nextProps.match.params.id);
      if (boardExists) {
        // Was a browser back action?
        if (
          navHistory.length >= 2 &&
          nextProps.match.params.id === navHistory[navHistory.length - 2]
        ) {
          changeBoard(nextProps.match.params.id);
          previousBoard();
          this.scrollToTop();
        }
      } else {
        // Was a browser back action?
        if (
          navHistory.length >= 2 &&
          nextProps.match.params.id === navHistory[navHistory.length - 2]
        ) {
          //board is invalid so we remove from navigation history
          historyRemoveBoard(nextProps.match.params.id);
        }
      }
    }
  }

  componentDidUpdate(prevProps) {
    const { board } = this.props;
    if (board && prevProps.board && board.isFixed !== prevProps.board.isFixed) {
      this.setState({ isFixedBoard: board.isFixed });
    }
  }

  toggleSelectMode() {
    this.setState(prevState => ({
      isSelecting: !prevState.isSelecting,
      isSelectAll: false,
      selectedTileIds: []
    }));
  }

  selectAllTiles() {
    const { board } = this.props;
    const allTileIds = board.tiles.map(tile => tile.id);

    this.setState({
      selectedTileIds: allTileIds
    });
  }

  selectTile(tileId) {
    this.setState({
      selectedTileIds: [...this.state.selectedTileIds, tileId]
    });
  }

  deselectTile(tileId) {
    const [...selectedTileIds] = this.state.selectedTileIds;
    const tileIndex = selectedTileIds.indexOf(tileId);
    selectedTileIds.splice(tileIndex, 1);
    this.setState({ selectedTileIds });
  }

  toggleTileSelect(tileId) {
    if (this.state.selectedTileIds.includes(tileId)) {
      this.deselectTile(tileId);
    } else {
      this.selectTile(tileId);
    }
  }

  async tryRemoteBoard(boardId) {
    const { userData, location } = this.props;

    const queryParams = new URLSearchParams(location.search);
    const isCbuilderBoard = queryParams.get('cbuilder');
    this.setState({ isCbuilderBoard });

    try {
      const remoteBoard = isCbuilderBoard
        ? await API.getCbuilderBoard(boardId)
        : await API.getBoard(boardId);

      //if requested board is from the user just add it
      if (
        'name' in userData &&
        'email' in userData &&
        remoteBoard.email === userData.email &&
        remoteBoard.author === userData.name
      ) {
        if (isCbuilderBoard) {
          this.setState({ copyPublicBoard: remoteBoard });
          return null;
        }
        return remoteBoard;
      } else {
        //if requested board is public, ask about copy it
        if (remoteBoard.isPublic) {
          this.setState({ copyPublicBoard: remoteBoard });
        } else {
          this.setState({ blockedPrivateBoard: true });
        }
        return null;
      }
    } catch (err) {
      if (
        isCbuilderBoard &&
        (err?.response?.status === 401 || err?.cause === 401)
      )
        this.setState({ blockedPrivateBoard: true });
      throw new Error('Cannot get the remote board');
    }
  }

  async captureBoardScreenshot() {
    const node = document.getElementById('BoardTilesContainer').firstChild;
    let dataURL = null;
    try {
      dataURL = await domtoimage.toPng(node);
    } catch (e) {}

    return dataURL;
  }

  async playAudio(src) {
    const safariNeedHelp =
      (IS_BROWSING_FROM_SAFARI || IS_BROWSING_FROM_APPLE_TOUCH) &&
      src.endsWith('.ogg');
    const audio = safariNeedHelp ? new ogv.OGVPlayer() : new Audio();
    audio.src = src;
    await audio.play();
  }

  handleEditBoardTitle = name => {
    const { board, updateBoard } = this.props;
    const titledBoard = {
      ...board,
      name: name
    };
    const processedBoard = this.updateIfFeaturedBoard(titledBoard);
    updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  saveApiBoardOperation = async board => {
    const {
      userData,
      communicator,
      replaceBoard,
      updateApiObjectsNoChild,
      lang,
      verifyAndUpsertCommunicator
    } = this.props;

    var createBoard = false;
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      this.setState({ isSaving: true });
      try {
        //prepare board
        let boardData = {
          ...board,
          author: userData.name,
          email: userData.email,
          hidden: false,
          locale: lang
        };
        //check if user has an own communicator
        if (communicator.email !== userData.email) {
          const communicatorData = {
            ...communicator,
            boards: boardData.id === 'root' ? ['root'] : ['root', boardData.id],
            rootBoard: 'root'
          };
          verifyAndUpsertCommunicator(communicatorData);
        }
        //check if we have to create a copy of the board
        if (boardData.id.length < 14) {
          createBoard = true;
          boardData = {
            ...boardData,
            isPublic: false
          };
        } else {
          //update the board
          updateBoard(boardData);
        }
        //api updates
        const boardId = await updateApiObjectsNoChild(
          boardData,

          createBoard
        );
        if (createBoard) {
          replaceBoard({ ...boardData }, { ...boardData, id: boardId });
        }
        this.historyReplaceBoardId(boardId);
      } catch (err) {
        console.log(err.message);
      } finally {
        this.setState({ isSaving: false });
      }
    }
  };

  handleEditClick = () => {
    this.setState({ tileEditorOpen: true });
  };

  handleBoardTypeChange = async () => {
    const { board, updateBoard } = this.props;

    this.setState({ isFixedBoard: !this.state.isFixedBoard });
    const newBoard = {
      ...board,
      isFixed: !this.state.isFixedBoard
    };
    if (!board.grid) {
      const defaultGrid = {
        rows: DEFAULT_ROWS_NUMBER,
        columns: DEFAULT_COLUMNS_NUMBER,
        order: this.getDefaultOrdering(board.tiles)
      };
      newBoard.grid = defaultGrid;
    }
    const processedBoard = this.updateIfFeaturedBoard(newBoard);
    await updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  getDefaultOrdering = tiles => {
    let order = [];
    let tilesIndex = 0;
    for (var i = 0; i < DEFAULT_ROWS_NUMBER; i++) {
      order[i] = [];
      for (var j = 0; j < DEFAULT_COLUMNS_NUMBER; j++) {
        if (tilesIndex < tiles.length && tiles[tilesIndex]) {
          order[i][j] = tiles[tilesIndex].id;
        } else {
          order[i][j] = null;
        }
        tilesIndex++;
      }
    }
    return order;
  };

  handleTileEditorCancel = () => {
    this.setState({ tileEditorOpen: false });
  };

  handleEditTileEditorSubmit = tiles => {
    const { board, editTiles, userData } = this.props;
    this.updateIfFeaturedBoard(board);
    editTiles(tiles, board.id);

    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      this.handleApiUpdates(null, null, tiles);
    }
    this.toggleSelectMode();
  };

  handleAddTileEditorSubmit = async tile => {
    const {
      userData,
      createTile,
      board,
      createBoard,
      switchBoard,
      addBoardCommunicator,
      history
    } = this.props;
    const boardData = {
      id: tile.loadBoard,
      name: tile.label,
      nameKey: tile.labelKey,
      hidden: false,
      tiles: [],
      isPublic: false,
      email: userData.email ? userData.email : board.email,
      author: userData.name ? userData.name : board.author
    };
    if (tile.loadBoard && !tile.linkedBoard) {
      createBoard(boardData);
      //TODO use verifyAndUpsertCommunicator before addBoardCommunicator
      addBoardCommunicator(boardData.id);
    }

    if (tile.type !== 'board') {
      this.updateIfFeaturedBoard(board);
      createTile(tile, board.id);
    }

    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      await this.handleApiUpdates(tile); // this function could mutate tthe tile
      return;
    }

    //if not and is adding an emptyBoard
    if (tile.type === 'board') {
      switchBoard(boardData.id);
      history.replace(`/board/${boardData.id}`, []);
    }
  };

  updateIfFeaturedBoard = board => {
    const { userData, updateBoard, intl, lang } = this.props;
    let boardData = {
      ...board
    };
    if (
      'name' in userData &&
      'email' in userData &&
      board.email !== userData.email
    ) {
      boardData = {
        ...boardData,
        name:
          board.name ||
          this.nameFromKey(board) ||
          intl.formatMessage(messages.myBoardTitle),
        author: userData.name,
        email: userData.email,
        hidden: false,
        isPublic: false,
        locale: lang
      };
      updateBoard(boardData);
    }
    return boardData;
  };

  nameFromKey = board => {
    let nameFromKey = undefined;
    if (board.nameKey) {
      const nameKeyArray = board.nameKey.split('.');
      nameFromKey = nameKeyArray[nameKeyArray.length - 1];
    }
    return nameFromKey;
  };

  handleAddClick = () => {
    this.setState({
      tileEditorOpen: true,
      selectedTileIds: [],
      isSelecting: false
    });
  };

  handleAddRemoveRow = async (isAdd, isLeftOrTop) => {
    const { board, updateBoard } = this.props;
    if ((!isAdd && board.grid.rows > 1) || (isAdd && board.grid.rows < 12)) {
      let newOrder = [];
      const newRows = isAdd ? board.grid.rows + 1 : board.grid.rows - 1;
      if (Array.isArray(board.grid.order) && board.grid.order.length) {
        newOrder = resize(
          board.grid.order,
          [newRows, board.grid.columns],
          null
        );
      } else {
        newOrder = this.getDefaultOrdering(board.tiles);
      }
      const tilesForNewOrder = getTilesListForNewOrder({
        tileItems: board.tiles,
        order: newOrder
      });

      const newBoard = {
        ...board,
        tiles: tilesForNewOrder,
        grid: {
          ...board.grid,
          rows: newRows,
          order: newOrder
        }
      };
      const processedBoard = this.updateIfFeaturedBoard(newBoard);
      updateBoard(processedBoard);
      this.saveApiBoardOperation(processedBoard);
    }
  };

  handleAddRemoveColumn = async (isAdd, isLeftOrTop) => {
    const { board, updateBoard } = this.props;
    if (
      (!isAdd && board.grid.columns > 1) ||
      (isAdd && board.grid.columns < 12)
    ) {
      let newOrder = [];
      const newColumns = isAdd
        ? board.grid.columns + 1
        : board.grid.columns - 1;
      if (Array.isArray(board.grid.order) && board.grid.order.length) {
        newOrder = resize(
          board.grid.order,
          [board.grid.rows, newColumns],
          null
        );
      } else {
        newOrder = this.getDefaultOrdering(board.tiles);
      }
      const tilesForNewOrder = getTilesListForNewOrder({
        tileItems: board.tiles,
        order: newOrder
      });
      const newBoard = {
        ...board,
        tiles: tilesForNewOrder,
        grid: {
          ...board.grid,
          columns: newColumns,
          order: newOrder
        }
      };
      const processedBoard = this.updateIfFeaturedBoard(newBoard);
      updateBoard(processedBoard);
      this.saveApiBoardOperation(processedBoard);
    }
  };

  handleLayoutChange = (currentLayout, layouts) => {
    const { updateBoard, replaceBoard, board, navigationSettings } = this.props;
    currentLayout.sort((a, b) => {
      if (a.y === b.y) {
        return a.x - b.x;
      } else if (a.y > b.y) {
        return 1;
      }
      return -1;
    });

    const tilesIds = currentLayout.map(gridTile => gridTile.i);
    const tiles = tilesIds.map(t => {
      return board.tiles.find(tile => {
        if (!tile) {
          return false;
        }
        return tile.id === t || Number(tile.id) === Number(t);
      });
    });

    if (navigationSettings.bigScrollButtonsActive) {
      const cols =
        currentLayout.reduce(function(valorAnterior, item) {
          if (item.x > valorAnterior) return item.x;
          return valorAnterior;
        }, 0) + 1;
      const rows = 3;
      const isScroll = currentLayout.length / cols > rows ? true : false;
      const totalRows = Math.ceil(currentLayout.length / cols);
      this.setIsScroll(isScroll, totalRows);
    }

    const newBoard = { ...board, tiles };
    replaceBoard(board, newBoard);
    if (!isEqual(board.tiles, tiles)) {
      const processedBoard = this.updateIfFeaturedBoard(newBoard);
      updateBoard(processedBoard);
      this.saveApiBoardOperation(processedBoard);
    }
  };

  setIsScroll = (bool, totalRows = 0) => {
    this.setState({ isScroll: bool, totalRows: totalRows });
  };

  handleTileDrop = async (tile, position) => {
    const { board, updateBoard } = this.props;
    const newOrder = moveOrderItem(tile.id, position, board.grid.order);

    const newBoard = {
      ...board,
      grid: {
        ...board.grid,
        order: newOrder
      }
    };
    const processedBoard = this.updateIfFeaturedBoard(newBoard);
    updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  handleLockClick = () => {
    this.setState((state, props) => ({
      isLocked: !state.isLocked,
      isSaving: false,
      isSelecting: false,
      selectedTileIds: []
    }));
  };

  handleSelectClick = () => {
    this.toggleSelectMode();
  };

  handleSelectAllToggle = () => {
    if (this.state.isSelectAll) {
      this.setState({ selectedTileIds: [] });
    } else {
      this.selectAllTiles();
    }

    this.setState(prevState => ({
      isSelectAll: !prevState.isSelectAll
    }));
  };

  handleTileClick = clickedTile => {
    const tile = {
      ...clickedTile,
      label: resolveTileLabel(clickedTile, this.props.intl)
    };
    if (this.state.isSelecting) {
      this.toggleTileSelect(tile.id);
      return;
    }

    const {
      changeBoard,
      changeOutput,
      clickSymbol,
      speak,
      intl,
      boards,
      showNotification,
      navigationSettings,
      isLiveMode
    } = this.props;
    const hasAction = tile.action && tile.action.startsWith('+');

    const say = () => {
      if (tile.sound) {
        this.playAudio(tile.sound);
      } else {
        const toSpeak = !hasAction ? tile.vocalization || tile.label : null;
        if (toSpeak) {
          speak(toSpeak);
        }
      }
    };

    if (tile.loadBoard) {
      const nextBoard =
        boards.find(b => b.id === tile.loadBoard) ||
        // If the board id is invalid, try falling back to a board
        // with the right name.
        boards.find(b => b.name === tile.label);
      if (nextBoard) {
        changeBoard(nextBoard.id);
        this.props.history.push(nextBoard.id);
        if (navigationSettings.vocalizeFolders) {
          say();
        }
      } else {
        showNotification(intl.formatMessage(messages.boardMissed));
      }
    } else {
      clickSymbol(tile.label);
      if (!navigationSettings.quietBuilderMode) {
        say();
      }
      if (isLiveMode) {
        const liveTile = {
          backgroundColor: 'rgb(255, 241, 118)',
          id: shortid.generate(),
          image: '',
          label: '',
          labelKey: '',
          type: 'live'
        };
        changeOutput([...this.props.output, tile, liveTile]);
      } else {
        changeOutput([...this.props.output, tile]);
      }
    }
  };

  handleAddTile = (tile, boardId) => {
    const { intl, createTile, showNotification } = this.props;
    createTile(tile, boardId);
    showNotification(intl.formatMessage(messages.tilesCreated));
  };

  handleDeleteClick = () => {
    const { intl, deleteTiles, showNotification, board, userData } = this.props;
    this.updateIfFeaturedBoard(board);
    deleteTiles(this.state.selectedTileIds, board.id);

    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      this.handleApiUpdates(null, this.state.selectedTileIds, null);
    }

    this.setState({
      selectedTileIds: []
    });
    showNotification(intl.formatMessage(messages.tilesDeleted));
    this.toggleSelectMode();
  };

  handleLockNotify = countdown => {
    const { intl, showNotification, hideNotification } = this.props;
    const quickUnlockActive = this.props.navigationSettings?.quickUnlockActive;

    if (quickUnlockActive) {
      hideNotification();
      this.handleLockClick();
      return;
    }
    if (countdown > 3) {
      return;
    }

    if (!countdown) {
      hideNotification();
      return;
    }

    const clicksToUnlock = `${countdown} ${intl.formatMessage(
      messages.clicksToUnlock
    )}`;

    hideNotification();
    // HACK: refactor Notification container
    setTimeout(() => {
      showNotification(clicksToUnlock);
    });
  };

  handleScannerStrategyNotification = () => {
    const {
      scannerSettings: { strategy },
      showNotification,
      intl
    } = this.props;
    const messagesKeyMap = {
      [SCANNING_METHOD_MANUAL]: messages.scannerManualStrategy,
      [SCANNING_METHOD_AUTOMATIC]: messages.scannerAutomaticStrategy
    };
    showNotification(intl.formatMessage(messagesKeyMap[strategy]));

    if (!isMobile.any) {
      setTimeout(() => {
        showNotification(intl.formatMessage(messages.scannerHowToDeactivate));
      }, NOTIFICATION_DELAY);
    }
  };

  async uploadTileSound(tile) {
    if (tile && tile.sound && tile.sound.startsWith('data')) {
      const { userData } = this.props;
      try {
        var blob = new Blob([this.convertDataURIToBinary(tile.sound)], {
          type: 'audio/mp3; codecs=opus'
        });
        const audioUrl = await API.uploadFile(blob, userData.email + '.mp3');
        tile.sound = audioUrl;
      } catch (err) {
        console.log(err.message);
      }
    }
    return tile;
  }

  convertDataURIToBinary(dataURI) {
    var BASE64_MARKER = ';base64,';
    var base64Index = dataURI.indexOf(BASE64_MARKER) + BASE64_MARKER.length;
    var base64 = dataURI.substring(base64Index);
    var raw = window.atob(base64);
    var rawLength = raw.length;
    var array = new Uint8Array(new ArrayBuffer(rawLength));

    for (let i = 0; i < rawLength; i++) {
      array[i] = raw.charCodeAt(i);
    }
    return array;
  }

  handleApiUpdates = async (
    tile = null,
    deletedTilesiIds = null,
    editedTiles = null,
    processedBoard = null
  ) => {
    const {
      userData,
      communicator,
      board,
      intl,
      verifyAndUpsertCommunicator,
      updateApiObjectsNoChild,
      updateApiObjects,
      replaceBoard,
      updateBoard,
      switchBoard,
      lang
    } = this.props;
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      this.setState({
        isSaving: true
      });

      if (tile && tile.sound && tile.sound.startsWith('data')) {
        tile = await this.uploadTileSound(tile);
      }
      if (editedTiles) {
        let _editedTiles = [];
        for (let _tile of editedTiles) {
          _editedTiles.push(await this.uploadTileSound(_tile));
        }
        editedTiles = _editedTiles;
      }

      var createParentBoard = false;
      var createChildBoard = false;
      var childBoardData = null;

      let uTiles = [];
      if (deletedTilesiIds) {
        uTiles = board.tiles.filter(
          cTile => !deletedTilesiIds.includes(cTile.id)
        );
      }
      if (editedTiles) {
        uTiles = board.tiles.map(
          cTile => editedTiles.find(s => s.id === cTile.id) || cTile
        );
      }
      if (tile && tile.type !== 'board') {
        uTiles = board.tiles.find(t => t.id === tile.id)
          ? [...board.tiles]
          : [...board.tiles, tile];
      }
      if (tile && tile.type === 'board') {
        uTiles = [...board.tiles];
      }

      let parentBoardData = processedBoard
        ? processedBoard
        : {
            ...board,
            name:
              board.name ||
              this.nameFromKey(board) ||
              intl.formatMessage(messages.myBoardTitle),
            tiles: uTiles,
            author: userData.name,
            email: userData.email,
            hidden: false,
            locale: lang
          };
      //check if user has an own communicator
      if (communicator.email !== userData.email) {
        verifyAndUpsertCommunicator(communicator);
      }
      //check for a new  own board
      if (tile && tile.loadBoard && !tile.linkedBoard) {
        const boardData = {
          id: tile.loadBoard,
          name: tile.label,
          nameKey: tile.labelKey,
          hidden: false,
          tiles: [],
          isPublic: false,
          author: userData.name,
          email: userData.email,
          locale: lang,
          caption: tile.image
        };
        childBoardData = { ...boardData };
        createChildBoard = true;
        updateBoard(childBoardData);
      }
      //check if we have to create a copy of the parent
      if (parentBoardData.id.length < 14) {
        createParentBoard = true;
        parentBoardData = {
          ...parentBoardData,
          isPublic: false
        };
      } else {
        //update the parent
        updateBoard(parentBoardData);
      }
      // Untill here all is with shorts ids
      //api updates
      if (tile && tile.type === 'board') {
        //child becomes parent
        updateApiObjectsNoChild(childBoardData, true)
          .then(parentBoardId => {
            switchBoard(parentBoardId);
            this.props.history.replace(`/board/${parentBoardId}`, []);
            this.setState({ isSaving: false });
          })
          .catch(e => {
            this.setState({ isSaving: false });
          });
      } else {
        if (!createChildBoard) {
          updateApiObjectsNoChild(parentBoardData, createParentBoard)
            .then(parentBoardId => {
              if (createParentBoard) {
                replaceBoard(
                  { ...parentBoardData },
                  { ...parentBoardData, id: parentBoardId }
                );
              }
              this.historyReplaceBoardId(parentBoardId);
              this.setState({ isSaving: false });
            })
            .catch(e => {
              this.setState({ isSaving: false });
            });
        } else {
          updateApiObjects(childBoardData, parentBoardData, createParentBoard)
            .then(parentBoardId => {
              if (createParentBoard) {
                /* Here the parentBoardData is not updated with the values
                that updatedApiObjects store on the API. Inside the boards are already updated
                an the value is not replaced because the oldboard Id was replaced on the updateApiObjects inside createApiBoardSuccess */
                replaceBoard(
                  { ...parentBoardData },
                  { ...parentBoardData, id: parentBoardId }
                );
              }
              this.historyReplaceBoardId(parentBoardId);
              this.setState({ isSaving: false });
            })
            .catch(e => {
              this.setState({ isSaving: false });
            });
        }
      }
    }
  };

  historyReplaceBoardId(boardId) {
    this.props.history.replace(`/board/${boardId}`);
  }

  onRequestPreviousBoard = () => {
    this.props.previousBoard();
    this.scrollToTop();
  };

  onRequestToRootBoard = () => {
    this.props.toRootBoard();
    this.scrollToTop();
  };

  scrollToTop = () => {
    if (this.boardRef && !this.state.isSelecting) {
      const boardComponentRef = this.props.board.isFixed
        ? 'fixedBoardContainerRef'
        : 'boardContainerRef';
      this.boardRef.current[boardComponentRef].current.scrollTop = 0;
    }
  };

  handleCopyRemoteBoard = async () => {
    const { intl, showNotification, history, switchBoard } = this.props;
    try {
      this.setState({
        isSaving: true
      });
      const copiedBoard = await this.createBoardsRecursively(
        this.state.copyPublicBoard
      );
      if (!copiedBoard?.id) {
        throw new Error('Board not copied correctly');
      }
      switchBoard(copiedBoard.id);
      history.replace(`/board/${copiedBoard.id}`, []);
      this.setState({
        copyPublicBoard: false,
        blockedPrivateBoard: false
      });
      showNotification(intl.formatMessage(messages.boardCopiedSuccessfully));
    } catch (err) {
      console.log(err.message);
      showNotification(intl.formatMessage(messages.boardCopyError));
      this.handleCloseDialog();
    }
    this.setState({
      isSaving: false
    });
  };

  async createBoardsRecursively(board, records) {
    const {
      createBoard,
      addBoardCommunicator,
      communicator,
      userData,
      updateApiObjectsNoChild,
      boards,
      intl,
      verifyAndUpsertCommunicator
    } = this.props;

    //prevent shit
    if (!board) {
      return null;
    }
    if (records) {
      //get the list of next boards in records
      let nextBoardsRecords = records.map(entry => entry.next);
      if (nextBoardsRecords.includes(board.id)) {
        return null;
      }
    }

    let newBoard = {
      ...board,
      isPublic: false,
      id: shortid.generate(),
      hidden: false,
      author: '',
      email: ''
    };
    if (!newBoard.name) {
      newBoard.name = newBoard.nameKey
        ? intl.formatMessage({ id: newBoard.nameKey })
        : intl.formatMessage(messages.noTitle);
    }
    if ('name' in userData && 'email' in userData) {
      newBoard = {
        ...newBoard,
        author: userData.name,
        email: userData.email
      };
    }
    createBoard(newBoard);
    if (!records) {
      verifyAndUpsertCommunicator(communicator);
      addBoardCommunicator(newBoard.id);
    }

    if (!records) {
      records = [{ prev: board.id, next: newBoard.id }];
    } else {
      records.push({ prev: board.id, next: newBoard.id });
    }
    this.updateBoardReferences(board, newBoard, records);

    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      try {
        const boardId = await updateApiObjectsNoChild(newBoard, true);
        newBoard = {
          ...newBoard,
          id: boardId
        };
      } catch (err) {
        console.log(err.message);
      }
    }

    if (board.tiles.length < 1) {
      return newBoard;
    }

    //return condition
    for (const tile of board.tiles) {
      if (tile.loadBoard && !tile.linkedBoard) {
        try {
          const nextBoard = await API.getBoard(tile.loadBoard);
          await this.createBoardsRecursively(nextBoard, records);
        } catch (err) {
          if (!err.respose || err.response?.status === 404) {
            //look for this board in available boards
            const localBoard = boards.find(b => b.id === tile.loadBoard);
            if (localBoard) {
              await this.createBoardsRecursively(localBoard, records);
            }
          }
        }
      }
    }
    return newBoard;
  }

  updateBoardReferences(board, newBoard, records) {
    const { boards, updateBoard } = this.props;
    //get the list of prev boards in records, but remove the current board
    let prevBoardsRecords = records.map(entry => entry.prev);
    prevBoardsRecords = prevBoardsRecords.filter(id => id !== newBoard.id);
    //look for reference to the original board id
    boards.forEach(b => {
      b.tiles.forEach((tile, index) => {
        if (
          //general case: tile can contains reference to the board
          tile &&
          tile.loadBoard &&
          tile.loadBoard === board.id
        ) {
          b.tiles.splice(index, 1, {
            ...tile,
            loadBoard: newBoard.id
          });
          try {
            updateBoard(b);
          } catch (err) {
            console.log(err.message);
          }
        }
        if (
          //special case: tile can contains reference to a prev board in records!
          tile &&
          tile.loadBoard &&
          prevBoardsRecords.includes(tile.loadBoard)
        ) {
          const el = records.find(e => e.prev === tile.loadBoard);
          b.tiles.splice(index, 1, {
            ...tile,
            loadBoard: el.next
          });
          try {
            updateBoard(b);
          } catch (err) {
            console.log(err.message);
          }
        }
      });
    });
  }

  handleCloseDialog = (event, reason) => {
    const { isSaving } = this.state;
    if (isSaving) return;
    this.setState({
      copyPublicBoard: false,
      blockedPrivateBoard: false,
      isCbuilderBoard: false
    });
  };

  publishBoard = () => {
    const { board, updateBoard } = this.props;
    const newBoard = {
      ...board,
      isPublic: !board.isPublic
    };
    const processedBoard = this.updateIfFeaturedBoard(newBoard);
    updateBoard(processedBoard);
    this.saveApiBoardOperation(processedBoard);
  };

  handleCopyTiles = () => {
    const { intl, showNotification } = this.props;
    const copiedTiles = this.selectedTiles();
    this.setState({
      copiedTiles: copiedTiles
    });
    showNotification(intl.formatMessage(messages.tilesCopiedSuccessfully));
  };

  handlePasteTiles = async () => {
    const { board, intl, createTile, showNotification } = this.props;
    try {
      this.setState({ isSaving: true });
      for await (const tile of this.state.copiedTiles) {
        const newTile = {
          ...tile,
          id: shortid.generate()
        };
        if (tile.loadBoard) {
          createTile(newTile, board.id);
          await this.pasteBoardsRecursively(newTile, board.id, tile.loadBoard);
        } else {
          await this.handleAddTileEditorSubmit(newTile);
        }
      }
      showNotification(intl.formatMessage(messages.tilesPastedSuccessfully));
    } catch (err) {
      showNotification(intl.formatMessage(messages.tilesPastedError));
      console.error(err.message);
    } finally {
      this.setState({ isSaving: false });
    }
  };

  async pasteBoardsRecursively(folderTile, parentBoardId, firstPastedFolderId) {
    const {
      createBoard,
      userData,
      updateBoard,
      createApiBoard,
      boards,
      intl
    } = this.props;

    //prevent shit
    if (!folderTile || !folderTile.loadBoard) {
      return;
    }

    let newBoard = {
      ...boards.find(b => b.id === folderTile.loadBoard),
      isPublic: false,
      id: shortid.generate(),
      hidden: false,
      author: '',
      email: ''
    };

    const tilesWithFatherRemoved = newBoard.tiles?.reduce((newTiles, tile) => {
      if (firstPastedFolderId !== tile.loadBoard) newTiles.push(tile);
      return newTiles;
    }, []);

    newBoard.tiles = tilesWithFatherRemoved;

    if (!newBoard.name) {
      newBoard.name = newBoard.nameKey
        ? intl.formatMessage({ id: newBoard.nameKey })
        : intl.formatMessage(messages.noTitle);
    }
    if ('name' in userData && 'email' in userData) {
      newBoard = {
        ...newBoard,
        author: userData.name,
        email: userData.email
      };
    }
    // Prevent creating a board without the tiles property
    if (newBoard.tiles) createBoard(newBoard);
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      try {
        newBoard = await createApiBoard(newBoard, newBoard.id);
      } catch (err) {
        console.error(err.message);
      }
    }
    const parentBoard = boards.find(b => b.id === parentBoardId);
    const newTiles = parentBoard.tiles.map(tile =>
      tile && tile.id === folderTile.id
        ? { ...tile, loadBoard: newBoard.id }
        : tile
    );
    const boardData = { ...parentBoard, tiles: newTiles };
    updateBoard(boardData);
    // Loggedin user?
    if ('name' in userData && 'email' in userData) {
      try {
        let newParentBoard = {
          ...boardData,
          hidden: false,
          author: userData.name,
          email: userData.email
        };
        if (!newParentBoard.name) {
          newParentBoard.name = newParentBoard.nameKey
            ? intl.formatMessage({ id: newParentBoard.nameKey })
            : intl.formatMessage(messages.noTitle);
        }
        await this.handleApiUpdates('', '', '', newParentBoard);
      } catch (err) {
        console.error(err.message);
      }
    }

    //return condition
    for await (const tile of newBoard.tiles) {
      if (tile && tile.loadBoard && !tile.linkedBoard) {
        //look for this board in available boards
        const newBoardToCopy = boards.find(b => b.id === tile.loadBoard);
        if (newBoardToCopy) {
          await this.pasteBoardsRecursively(
            tile,
            newBoard.id,
            firstPastedFolderId
          );
        }
      }
    }
    return;
  }

  selectedTiles = () => {
    return this.state.selectedTileIds
      ? this.state.selectedTileIds.map(selectedTileId => {
          const tiles = this.props.board.tiles.filter(tile => {
            return tile.id === selectedTileId;
          })[0];

          return tiles;
        })
      : [];
  };

  handleAddApiBoard = async boardId => {
    if (!this.props.boards.find(board => board.id === boardId)) {
      try {
        const board = await API.getBoard(boardId);
        this.props.addBoards([board]);
      } catch (err) {
        console.log(err.message);
      }
    }
  };

  render() {
    const {
      navHistory,
      board,
      focusTile,
      isPremiumRequiredModalOpen,
      improvedPhrase,
      speak
    } = this.props;
    const { isCbuilderBoard } = this.state;

    if (!this.props.board) {
      return (
        <div className="Board__loading">
          <CircularProgress size={60} thickness={5} color="inherit" />
        </div>
      );
    }

    const disableBackButton = navHistory.length === 1;
    const editingTiles = this.state.tileEditorOpen
      ? this.state.selectedTileIds.map(selectedTileId => {
          const tiles = board.tiles.filter(tile => {
            return tile.id === selectedTileId;
          })[0];

          return tiles;
        })
      : [];

    return (
      <Fragment>
        <Board
          board={board}
          intl={this.props.intl}
          scannerSettings={this.props.scannerSettings}
          deactivateScanner={this.props.deactivateScanner}
          disableBackButton={disableBackButton}
          userData={this.props.userData}
          isLocked={this.state.isLocked}
          isSaving={this.state.isSaving}
          isSelecting={this.state.isSelecting}
          isSelectAll={this.state.isSelectAll}
          isFixedBoard={this.state.isFixedBoard}
          isRootBoardTourEnabled={this.props.isRootBoardTourEnabled}
          isUnlockedTourEnabled={this.props.isUnlockedTourEnabled}
          //updateBoard={this.handleUpdateBoard}
          onAddClick={this.handleAddClick}
          onDeleteClick={this.handleDeleteClick}
          onEditClick={this.handleEditClick}
          onSelectAllToggle={this.handleSelectAllToggle}
          onFocusTile={focusTile}
          onLockClick={this.handleLockClick}
          onLockNotify={this.handleLockNotify}
          onScannerActive={this.handleScannerStrategyNotification}
          onRequestPreviousBoard={this.onRequestPreviousBoard}
          onRequestToRootBoard={this.onRequestToRootBoard}
          onSelectClick={this.handleSelectClick}
          onTileClick={this.handleTileClick}
          onBoardTypeChange={this.handleBoardTypeChange}
          editBoardTitle={this.handleEditBoardTitle}
          selectedTileIds={this.state.selectedTileIds}
          displaySettings={this.props.displaySettings}
          navigationSettings={this.props.navigationSettings}
          navHistory={this.props.navHistory}
          publishBoard={this.publishBoard}
          showNotification={this.props.showNotification}
          emptyVoiceAlert={this.props.emptyVoiceAlert}
          offlineVoiceAlert={this.props.offlineVoiceAlert}
          onAddRemoveColumn={this.handleAddRemoveColumn}
          onAddRemoveRow={this.handleAddRemoveRow}
          onTileDrop={this.handleTileDrop}
          onLayoutChange={this.handleLayoutChange}
          disableTour={this.props.disableTour}
          onCopyTiles={this.handleCopyTiles}
          onPasteTiles={this.handlePasteTiles}
          copiedTiles={this.state.copiedTiles}
          setIsScroll={this.setIsScroll}
          isScroll={this.state.isScroll}
          totalRows={this.state.totalRows}
          ref={this.boardRef}
          changeDefaultBoard={this.props.changeDefaultBoard}
          improvedPhrase={improvedPhrase}
          speak={speak}
        />
        <Dialog
          open={!!this.state.copyPublicBoard && !isPremiumRequiredModalOpen}
          TransitionComponent={Transition}
          keepMounted
          onClose={this.handleCloseDialog}
          aria-labelledby="dialog-copy-title"
          aria-describedby="dialog-copy-desc"
        >
          <DialogTitle id="dialog-copy-board-title">
            {this.props.intl.formatMessage(
              isCbuilderBoard
                ? messages.importCbuilderBoardTitle
                : messages.copyPublicBoardTitle
            )}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="dialog-copy-board-desc">
              {this.props.intl.formatMessage(
                isCbuilderBoard
                  ? messages.importCbuilderBoardDesc
                  : messages.copyPublicBoardDesc
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={this.handleCloseDialog}
              color="primary"
              disabled={this.state.isSaving}
            >
              {this.props.intl.formatMessage(messages.boardCopyCancel)}
            </Button>
            <PremiumFeature>
              <Button
                onClick={this.handleCopyRemoteBoard}
                color="primary"
                variant="contained"
                disabled={this.state.isSaving}
              >
                {this.state.isSaving ? (
                  <LoadingIcon />
                ) : (
                  this.props.intl.formatMessage(messages.boardCopyAccept)
                )}
              </Button>
            </PremiumFeature>
          </DialogActions>
        </Dialog>
        <Dialog
          open={this.state.blockedPrivateBoard}
          TransitionComponent={Transition}
          keepMounted
          onClose={this.handleCloseDialog}
          aria-labelledby="dialog-blocked-title"
          aria-describedby="dialog-blocked-desc"
        >
          <DialogTitle id="dialog-blocked-board-title">
            {this.props.intl.formatMessage(
              isCbuilderBoard
                ? messages.importCbuilderBoardTitle
                : messages.blockedPrivateBoardTitle
            )}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="dialog-blocked-board-desc">
              {this.props.intl.formatMessage(
                isCbuilderBoard
                  ? messages.loginToImport
                  : messages.blockedPrivateBoardDesc
              )}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={this.handleCloseDialog}
              color="primary"
              variant="contained"
            >
              {this.props.intl.formatMessage(messages.boardCopyAccept)}
            </Button>
          </DialogActions>
        </Dialog>
        <TileEditor
          editingTiles={editingTiles}
          open={this.state.tileEditorOpen}
          onClose={this.handleTileEditorCancel}
          onEditSubmit={this.handleEditTileEditorSubmit}
          onAddSubmit={this.handleAddTileEditorSubmit}
          boards={this.props.boards.filter(
            board =>
              board !== null &&
              board.id !== null &&
              this.props.communicator.boards.includes(board.id)
          )}
          userData={this.props.userData}
          folders={this.props.boards}
          onAddApiBoard={this.handleAddApiBoard}
        />
      </Fragment>
    );
  }
}

const mapStateToProps = ({
  board,
  communicator,
  speech,
  scanner,
  app: { displaySettings, navigationSettings, userData, isConnected, liveHelp },
  language: { lang },
  subscription: { premiumRequiredModalState }
}) => {
  const activeCommunicatorId = communicator.activeCommunicatorId;
  const currentCommunicator = communicator.communicators.find(
    communicator => communicator.id === activeCommunicatorId
  );
  const activeBoardId = board.activeBoardId;
  const emptyVoiceAlert =
    speech.voices.length > 0 && speech.options.voiceURI !== EMPTY_VOICES
      ? false
      : true;
  const offlineVoiceAlert = !isConnected && speech.options.isCloud;
  return {
    communicator: currentCommunicator,
    board: board.boards.find(board => board.id === activeBoardId),
    boards: board.boards,
    output: board.output,
    isLiveMode: board.isLiveMode,
    scannerSettings: scanner,
    navHistory: board.navHistory,
    displaySettings,
    navigationSettings,
    userData,
    emptyVoiceAlert,
    lang,
    offlineVoiceAlert,
    isRootBoardTourEnabled: liveHelp.isRootBoardTourEnabled,
    isUnlockedTourEnabled: liveHelp.isUnlockedTourEnabled,
    isPremiumRequiredModalOpen: premiumRequiredModalState?.open,
    improvedPhrase: board.improvedPhrase
  };
};

const mapDispatchToProps = {
  addBoards,
  changeBoard,
  replaceBoard,
  previousBoard,
  toRootBoard,
  historyRemoveBoard,
  createBoard,
  updateBoard,
  switchBoard,
  createTile,
  deleteTiles,
  editTiles,
  focusTile,
  clickSymbol,
  changeOutput,
  speak,
  cancelSpeech,
  showNotification,
  hideNotification,
  deactivateScanner,
  addBoardCommunicator,
  updateApiObjects,
  updateApiObjectsNoChild,
  getApiObjects,
  downloadImages,
  disableTour,
  createApiBoard,
  upsertApiBoard,
  changeDefaultBoard,
  verifyAndUpsertCommunicator
};

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(BoardContainer));

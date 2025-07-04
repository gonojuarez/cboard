import API from '../../../api';
import { LOGIN_SUCCESS, LOGOUT } from './Login.constants';
import { addBoards } from '../../Board/Board.actions';
import {
  changeVoice,
  changePitch,
  changeRate
} from '../../../providers/SpeechProvider/SpeechProvider.actions';
import {
  disableTour,
  setUnloggedUserLocation,
  updateUnloggedUserLocation,
  enableAllTours,
  updateNavigationSettings
} from '../../App/App.actions';
import { getVoiceURI } from '../../../i18n';
import { isCordova, isElectron } from '../../../cordova-util';

export function loginSuccess(payload) {
  return dispatch => {
    dispatch({
      type: LOGIN_SUCCESS,
      payload
    });
    if (payload.isFirstLogin) firstLoginActions(dispatch, payload);

    if (isCordova() && !isElectron()) {
      try {
        window.FirebasePlugin.setUserId(payload.id);
      } catch (err) {
        console.error(err);
      }
    }
    if (!isCordova() && typeof window?.gtag === 'function')
      window.gtag('set', { user_id: payload.id });
  };
}

async function firstLoginActions(dispatch, payload) {
  try {
    await API.updateUser({ ...payload, isFirstLogin: false });
  } catch (err) {
    console.error(err);
  }
  dispatch(enableAllTours());
}

export function logout() {
  if (isCordova() && !isElectron())
    try {
      window.FirebasePlugin.setUserId(undefined);
    } catch (err) {
      console.error(err);
    }

  if (!isCordova() && typeof window?.gtag === 'function') {
    window.gtag('set', { user_id: null });
  }

  return async dispatch => {
    dispatch(updateNavigationSettings({ improvePhraseActive: false }));
    dispatch(setUnloggedUserLocation(null));
    dispatch(updateUnloggedUserLocation());
    dispatch(logoutSuccess());
  };
}

function logoutSuccess() {
  return {
    type: LOGOUT
  };
}

export function login({ email, password, activatedData }, type = 'local') {
  const setAVoice = ({ loginData, dispatch, getState }) => {
    const {
      language: { lang: appLang },
      speech: {
        voices,
        options: { lang: deviceVoiceLang, voiceURI: deviceVoiceUri }
      }
    } = getState(); //ATENTION speech options on DB is under Speech directly. on state is under options
    const emptyVoiceString = 'empty voices';
    const appLanguageCode = appLang?.substring(0, 2);
    const deviceVoiceLanguageCode = deviceVoiceLang?.substring(0, 2);

    if (voices.length) {
      const uris = voices.map(v => {
        return v.voiceURI;
      });

      //if redux state have a defined voiceUri. Set it By default
      if (
        deviceVoiceUri &&
        deviceVoiceLanguageCode === appLanguageCode &&
        uris.includes(deviceVoiceUri)
      ) {
        return;
      }
      //if not Try to use API stored Voice
      if (loginData.settings?.speech) {
        const userVoiceUri = loginData.settings.speech.voiceURI; //ATENTION speech options on DB is under Speech directly. on state is under options

        const userVoiceLanguage = voices.filter(
          voice => voice.voiceURI === userVoiceUri
        )[0]?.lang;

        const userVoiceLanguageCode = userVoiceLanguage?.substring(0, 2);

        if (
          userVoiceUri &&
          appLanguageCode === userVoiceLanguageCode &&
          uris.includes(userVoiceUri)
        ) {
          dispatch(changeVoice(userVoiceUri, userVoiceLanguage));
          if (loginData.settings.speech.pitch) {
            dispatch(changePitch(loginData.settings.speech.pitch));
          }
          if (loginData.settings.speech.rate) {
            dispatch(changeRate(loginData.settings.speech.rate));
          }
          return;
        }
      }

      const defaultVoiceUri = getVoiceURI(appLang, voices);

      if (defaultVoiceUri === emptyVoiceString) {
        dispatch(changeVoice(emptyVoiceString, ''));
        return;
      }
      //if the api stored voice is unavailable. Set default voice
      const defaultVoiceLanguage = voices.filter(
        voice => voice.voiceURI === defaultVoiceUri
      )[0]?.lang;
      dispatch(changeVoice(defaultVoiceUri, defaultVoiceLanguage));
      return;
    }
    if (deviceVoiceLang === null) {
      dispatch(changeVoice(emptyVoiceString, ''));
      return;
    }
  };

  return async (dispatch, getState) => {
    try {
      const apiMethod = type === 'local' ? 'login' : 'oAuthLogin';
      const loginData = activatedData
        ? activatedData
        : await API[apiMethod](email, password);
      const { communicator, board } = getState();

      const activeCommunicatorId = communicator.activeCommunicatorId;
      let currentCommunicator = communicator.communicators.find(
        communicator => communicator.id === activeCommunicatorId
      );

      if (loginData.communicators && loginData.communicators.length) {
        const lastRemoteSavedCommunicatorIndex =
          loginData.communicators.length - 1;
        currentCommunicator =
          loginData.communicators[lastRemoteSavedCommunicatorIndex]; //use the latest communicator
      }

      const localBoardsIds = [];
      board.boards.forEach(board => {
        if (currentCommunicator.boards.indexOf(board.id) >= 0) {
          localBoardsIds.push(board.id);
        }
      });

      const apiBoardsIds = currentCommunicator.boards.filter(
        id => localBoardsIds.indexOf(id) < 0
      );

      const apiBoards = await Promise.all(
        apiBoardsIds
          .map(async id => {
            let board = null;
            try {
              board = await API.getBoard(id);
            } catch (e) {}
            return board;
          })
          .filter(b => b !== null)
      );

      dispatch(addBoards(apiBoards));
      if (type === 'local') {
        dispatch(
          disableTour({
            isRootBoardTourEnabled: false,
            isUnlockedTourEnabled: false,
            isSettingsTourEnabled: false,
            isAnalyticsTourEnabled: false
          })
        );
      }
      dispatch(loginSuccess(loginData));
      setAVoice({ loginData, dispatch, getState });
    } catch (e) {
      if (e.response != null) {
        return Promise.reject(e.response.data);
      }
      var disonnected = {
        message: 'Unable to contact server. Try in a moment'
      };
      return Promise.reject(disonnected);
    }
  };
}

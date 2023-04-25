import {
  UPDATE_SUBSCRIBER_ID,
  UPDATE_SUBSCRIPTION,
  UPDATE_SUBSCRIPTION_ERROR,
  SHOW_PREMIUM_REQUIRED,
  HIDE_PREMIUM_REQUIRED,
  NOT_SUBSCRIBED,
  REQUIRING_PREMIUM_COUNTRIES,
  ACTIVE,
  CANCELED,
  IN_GRACE_PERIOD,
  EXPIRED,
  PROCCESING
} from './SubscriptionProvider.constants';
import API from '../../api';
import { isLogged } from '../../components/App/App.selectors';

export function updateIsInFreeCountry() {
  return (dispatch, getState) => {
    const state = getState();
    const locationCode = isLogged(state)
      ? state.app.userData?.location?.countryCode
      : state.app.unloggedUserLocation?.countryCode;
    const isInFreeCountry = !REQUIRING_PREMIUM_COUNTRIES.includes(locationCode);
    dispatch(
      updateSubscription({
        isInFreeCountry
      })
    );
    return isInFreeCountry;
  };
}

export function updateIsOnTrialPeriod() {
  return (dispatch, getState) => {
    const state = getState();
    const userCreatedAt = state.app.userData.createdAt;
    const isOnTrialPeriod = isUserOnTrialPeriod(userCreatedAt);
    dispatch(
      updateSubscription({
        isOnTrialPeriod
      })
    );
    return isOnTrialPeriod;

    function isUserOnTrialPeriod(createdAt) {
      if (!createdAt) return false; //this case are already created users
      const createdAtDate = new Date(createdAt);
      const actualDate = new Date();
      const DAYS_TO_TRY = 30;
      const tryLimitDate = createdAtDate.setDate(
        createdAtDate.getDate() + DAYS_TO_TRY
      );
      if (actualDate >= tryLimitDate) return false;
      return true;
    }
  };
}

export function updateIsSubscribed(isOnResume = false) {
  return async (dispatch, getState) => {
    let isSubscribed = false;
    let ownedProduct = '';
    let androidSubscriptionState = NOT_SUBSCRIBED;
    let expiryDate = null;
    let isVerifying = false;
    const state = getState();
    try {
      if (!isLogged(state)) {
        dispatch(
          updateSubscription({
            ownedProduct,
            androidSubscriptionState,
            isSubscribed,
            expiryDate,
            isVerifying
          })
        );
      } else {
        if (isOnResume && state.subscription.isVerifying) return;

        const userId = state.app.userData.id;
        const { status, product, transaction } = await API.getSubscriber(
          userId
        );
        isSubscribed =
          status.toLowerCase() === ACTIVE ||
          status.toLowerCase() === CANCELED ||
          status.toLowerCase() === IN_GRACE_PERIOD
            ? true
            : false;
        if (product && isSubscribed) {
          ownedProduct = {
            billingPeriod: product.billingPeriod,
            id: product._id,
            price: product.price,
            subscriptionId: product.subscriptionId,
            tag: product.tag,
            title: product.title
          };
        }
        if (transaction?.expiryDate) {
          expiryDate = transaction.expiryDate;
        }
        dispatch(
          updateSubscription({
            ownedProduct,
            androidSubscriptionState: status.toLowerCase(),
            isSubscribed,
            expiryDate
          })
        );
      }
    } catch (err) {
      console.error(err.message);

      //Handle subscription status if is offline or have error getting subscriber
      expiryDate = state.subscription.expiryDate;
      androidSubscriptionState = state.subscription.androidSubscriptionState;
      isSubscribed = state.subscription.isSubscribed;

      if (expiryDate && isSubscribed) {
        const expiryDateFormat = new Date(expiryDate);
        const expiryDateMillis = expiryDateFormat.getTime();
        const nowInMillis = Date.now();
        const isExpired = nowInMillis > expiryDateMillis;

        // Change to 14 days before merge in production
        const daysGracePeriod = 3;

        const billingRetryPeriodFinishDate =
          androidSubscriptionState === ACTIVE
            ? expiryDateFormat.setMinutes(
                //Change to expiryDateFormat.setDate before merge in production
                expiryDateFormat.getMinutes() + daysGracePeriod //Change to expiryDateFormat.getDate() before merge in production
              )
            : expiryDateFormat;

        if (isExpired) {
          const isBillingRetryPeriodFinished =
            nowInMillis > billingRetryPeriodFinishDate;

          if (
            androidSubscriptionState === CANCELED ||
            isBillingRetryPeriodFinished
          ) {
            dispatch(
              updateSubscription({
                isSubscribed: false,
                androidSubscriptionState: EXPIRED,
                ownedProduct: ''
              })
            );
            return;
          }
          dispatch(
            updateSubscription({
              isSubscribed: true,
              expiryDate: billingRetryPeriodFinishDate,
              androidSubscriptionState: IN_GRACE_PERIOD
            })
          );
        }
      }
      if (androidSubscriptionState === PROCCESING) {
        dispatch(
          updateSubscription({
            isSubscribed: false,
            androidSubscriptionState: NOT_SUBSCRIBED,
            ownedProduct: ''
          })
        );
      }
    }
  };
}

export function updatePlans() {
  return async (dispatch, getState) => {
    const state = getState();
    try {
      const { data } = await API.listSubscriptions();
      const locationCode = isLogged(state)
        ? state.app.userData?.location?.countryCode
        : state.app.unloggedUserLocation?.countryCode;
      // get just subscriptions with active plans
      const plans = getActivePlans(data);
      const products = plans.map(plan => {
        const result = {
          id: plan.planId,
          subscriptionId: plan.subscriptionId,
          billingPeriod: plan.period,
          price: getPrice(plan.countries, locationCode),
          title: plan.subscriptionName,
          tag: plan.tags[0]
        };
        return result;
      });

      dispatch(
        updateSubscription({
          products: [...products]
        })
      );
    } catch (err) {
      console.error(err.message);
    }
  };

  function getPrice(countries, country) {
    let price = '';
    if (countries)
      countries.forEach(element => {
        if (element.regionCode === country) price = element.price;
      });
    return price;
  }

  function getActivePlans(subscriptions) {
    let plans = [];
    if (subscriptions)
      subscriptions.forEach(subscription => {
        if (subscription.plans)
          subscription.plans.forEach(plan => {
            if (plan.status.toLowerCase() === 'active') {
              plan.subscriptionName = subscription.name;
              plan.subscriptionId = subscription.subscriptionId;
              plans.push(plan);
            }
          });
      });
    return plans;
  }
}

export function updateSubscriberId(payload = {}) {
  return {
    type: UPDATE_SUBSCRIBER_ID,
    payload
  };
}
export function updateSubscription(payload) {
  return {
    type: UPDATE_SUBSCRIPTION,
    payload
  };
}
export function updateSubscriptionError(payload) {
  return {
    type: UPDATE_SUBSCRIPTION_ERROR,
    payload
  };
}

export function showPremiumRequired(
  { showTryPeriodFinishedMessages } = { showTryPeriodFinishedMessages: false }
) {
  return {
    type: SHOW_PREMIUM_REQUIRED,
    showTryPeriodFinishedMessages
  };
}

export function hidePremiumRequired() {
  return {
    type: HIDE_PREMIUM_REQUIRED
  };
}

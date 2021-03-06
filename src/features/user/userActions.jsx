import moment from 'moment';
import { toastr } from 'react-redux-toastr';
import cuid from 'cuid';
import firebase from '../../app/config/firebase';
import { FETCH_EVENTS } from '../event/eventConstants'
import { asyncActionError, asyncActionStart, asyncActionFinish } from '../async/asyncActions'

export const updateProfile = user => async (
  dispatch,
  getState,
  { getFirebase }
) => {
  const firebase = getFirebase();
  const { isLoaded, isEmpty, ...updatedUser } = user;
  if (updatedUser.dateOfBirth !== getState().firebase.profile.dateOfBirth) {
    updatedUser.dateOfBirth = moment(updatedUser.dateOfBirth).toDate();
  }

  try {
    await firebase.updateProfile(updatedUser);
    toastr.success('Успех', 'Профиль изменён');
  } catch (error) {
    toastr.error('Упс', 'Попробуйте еще-раз');
  }
};

export const uploadProfileImage = (file, fileName) => async (
  dispatch,
  getState,
  { getFirebase, getFirestore }
) => {
  const imageName = cuid();
  const firebase = getFirebase();
  const firestore = getFirestore();
  const user = firebase.auth().currentUser;
  const path = `${user.uid}/user_images`;
  const options = {
    name: imageName
  };
  try {
    dispatch(asyncActionStart())
    // upload the file to fb storage
    let uploadedFile = await firebase.uploadFile(path, file, null, options);
    // get url of image
    let downloadURL = await uploadedFile.uploadTaskSnapshot.downloadURL;
    // get the userdoc from firestore
    let userDoc = await firestore.get(`users/${user.uid}`);
    // check if user has photo, if not update profile
    if (!userDoc.data().photoURL) {
      await firebase.updateProfile({
        photoURL: downloadURL
      });
      await user.updateProfile({
        photoURL: downloadURL
      });
    }
    // add the new photo to photos collection
    await firestore.add({
      collection: 'users',
      doc: user.uid,
      subcollections: [{collection: 'photos'}]
    }, {
      name: imageName,
      url: downloadURL
    })
    dispatch(asyncActionFinish())
  } catch (error) {
    dispatch(asyncActionError())
    throw new Error('Проблемы с загрузкой фотографии')
  }
};

export const deletePhoto = (photo) => 
  async (dispatch, getState, {getFirebase, getFirestore}) => {
    const firebase = getFirebase();
    const firestore = getFirestore();
    const user = firebase.auth().currentUser;
    try {
      await firebase.deleteFile(`${user.uid}/user_images/${photo.name}`)
      await firestore.delete({
        collection: 'users',
        doc: user.uid,
        subcollections: [{collection: 'photos', doc: photo.id}]
      })
    } catch (error) {
      throw new Error('Проблема с удалением фото')
    }
  }

	export const setMainPhoto = photo => async (dispatch, getState) => {
		dispatch(asyncActionStart())
		const firestore = firebase.firestore();
		const user = firebase.auth().currentUser;
		const today = new Date(Date.now());
		let userDocRef = firestore.collection('users').doc(user.uid);
		let eventAttendeeRef = firestore.collection('event_attendee');
		let activityDocRef = firestore.collection('activity');
		try {
			let batch = firestore.batch();
	
			await batch.update(userDocRef, {
				photoURL: photo.url
			});
	
			let eventQuery = await eventAttendeeRef.where('userUid', '==', user.uid).where('eventDate', '>', today);
			let activityQuery = await activityDocRef.where('hostUid', '==', user.uid)
	
			let eventQuerySnap = await eventQuery.get();
			let activityQuerySnap = await activityQuery.get();
			for (let i=0; i<eventQuerySnap.docs.length; i++) {
				let eventDocRef = await firestore.collection('events').doc(eventQuerySnap.docs[i].data().eventId)
				let event = await eventDocRef.get();
				if (event.data().hostUid === user.uid) {
					batch.update(eventDocRef, {
						hostPhotoURL: photo.url,
						[`attendees.${user.uid}.photoURL`]: photo.url
					})
				} else {
					batch.update(eventDocRef, {
						[`attendees.${user.uid}.photoURL`]: photo.url
					})
				}
			}

			for (let i=0; i<activityQuerySnap.docs.length; i++) {
				let activityDocRef = await firestore.collection('activity').doc(activityQuerySnap.docs[i].id)
				const activity = await activityDocRef.get();
				if (activity.data().hostUid === user.uid) {
					batch.update(activityDocRef, {
						photoURL: photo.url,
					})
				}
			}

			await batch.commit();
			dispatch(asyncActionFinish());
			toastr.success('Успех', 'Основное фото изменено');
		} catch (error) {
			console.log(error);
			dispatch(asyncActionError())
			throw new Error('Установить фото профиля не удалось');
		}
	};
	
	export const goingToEvent = event => async (dispatch, getState) => {
		dispatch(asyncActionStart())
		const firestore = firebase.firestore();
		const user = firebase.auth().currentUser;
		const profile = getState().firebase.profile;
		const attendee = {
			going: true,
			joinDate: Date.now(),
			photoURL: profile.photoURL || '/assets/user.png',
			displayName: profile.displayName,
			host: false
		};
		try {
			let eventDocRef = firestore.collection('events').doc(event.id);
			let eventAttendeeDocRef = firestore.collection('event_attendee').doc(`${event.id}_${user.uid}`);
	
			await firestore.runTransaction(async (transaction) => {
				await transaction.get(eventDocRef);
				await transaction.update(eventDocRef, {
					[`attendees.${user.uid}`]: attendee
				})
				await transaction.set(eventAttendeeDocRef, {
					eventId: event.id,
					userUid: user.uid,
					eventDate: event.date,
					host: false
				})
			})
			dispatch(asyncActionFinish())
			toastr.success('Успех', 'Вы стали участником встречи');
		} catch (error) {
			console.log(error);
			dispatch(asyncActionError())
			toastr.error('Упс', 'Попробуйте еще-раз');
		}
	};

export const cancelGoingToEvent = (event) => 
  async (dispatch, getState, {getFirestore, getFirebase}) => {
		const firestore = getFirestore();
		const firebase = getFirebase();
    const user = firebase.auth().currentUser;
    try {
      await firestore.update(`events/${event.id}`, {
        [`attendees.${user.uid}`]: firestore.FieldValue.delete()
      })
      await firestore.delete(`event_attendee/${event.id}_${user.uid}`);
      toastr.success('Успех', 'Вы передумали идти на встречу');
    } catch (error) {
      toastr.error('Упс', 'Попробуйте еще-раз')
    }

	}
	
	export const getUserEvents = (userUid, activeTab) => async (dispatch, getState) => {
		dispatch(asyncActionStart());
		const firestore = firebase.firestore();
		const today = new Date(Date.now());
		let eventsRef = firestore.collection('event_attendee');
		let query;
		switch (activeTab) {
			case 1: // past events
				query = eventsRef
					.where('userUid', '==', userUid)
					.where('eventDate', '<=', today)
					.orderBy('eventDate', 'desc');
				break;
			case 2: // future events
				query = eventsRef
					.where('userUid', '==', userUid)
					.where('eventDate', '>=', today)
					.orderBy('eventDate');
				break;
			case 3: // hosted events
				query = eventsRef
					.where('userUid', '==', userUid)
					.where('host', '==', true)
					.orderBy('eventDate', 'desc');
				break;
			default:
				query = eventsRef.where('userUid', '==', userUid).orderBy('eventDate', 'desc');
		}
		try {
			let querySnap = await query.get();
			let events = [];
	
			for (let i=0; i<querySnap.docs.length; i++) {
				let evt = await firestore.collection('events').doc(querySnap.docs[i].data().eventId).get();
				events.push({...evt.data(), id: evt.id})
			}
	
			dispatch({type: FETCH_EVENTS, payload: {events}})
			
			dispatch(asyncActionFinish());
		} catch (error) {
			dispatch(asyncActionError());
		}
	};

	export const followUser = userToFollow => async (dispatch, getState, {getFirebase, getFirestore}) => {
		const firebase = getFirebase();
		const firestore = getFirestore();
		const user = firebase.auth().currentUser;
		const following = {
			photoURL: userToFollow.photoURL || '/assets/user.png',
			city: userToFollow.city || 'unknown city',
			displayName: userToFollow.displayName
		}
		try {
			await firestore.set(
				{
					collection: 'users',
					doc: user.uid,
					subcollections: [{collection: 'following', doc: userToFollow.id}]
				},
				following
			);
		} catch (error) {
			toastr.error('Упс', 'Попробуйте еще-раз')
		}
	}
	
	export const unfollowUser  = (userToUnfollow) =>
		async (dispatch, getState, {getFirebase, getFirestore}) => {
			const firebase = getFirebase();
			const firestore = getFirestore();
			const user = firebase.auth().currentUser;
			try {
				await firestore.delete({
					collection: 'users',
					doc: user.uid,
					subcollections: [{collection: 'following', doc: userToUnfollow.id}]
				})
			} catch (error) {
				toastr.error('Упс', 'Попробуйте еще-раз')
			}
		}
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Icon } from 'web-common/components';

import deepEqual from 'deep-equal';
import Libraries from '../libraries';
import Modal from '../ui/modal';
import TouchHeader from '../touch-header.jsx';
import { get } from '../../utils';
import { MOVE_COLLECTION } from '../../constants/modals';
import { toggleModal, updateCollection } from '../../actions';
import { useNavigationState } from '../../hooks';

const MoveCollectionsModal = () => {
	const dispatch = useDispatch();
	const collectionKey = useSelector(state => state.modal.collectionKey);
	const libraryKey = useSelector(state => state.modal.libraryKey);
	const currentParentCollectionKey = useSelector(
		state => get(state, ['libraries', libraryKey, 'collections', 'data', collectionKey, 'parentCollection'], false)
	);
	const isOpen = useSelector(state => state.modal.id === MOVE_COLLECTION);
	const isSingleColumn = useSelector(state => state.device.isSingleColumn);
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);
	const [isBusy, setIsBusy] = useState(false);
	const [picked, setPicked] = useState([]);
	const {navState, touchHeaderPath, handleNavigation, resetNavState} = useNavigationState();

	// @TODO: to prevent re-renders we memoize as much of a "device" as TouchHeader requires.
	// 		  remove this once TouchHeader is rewritten to use useSelector instead
	const device = useMemo(() => ({ isSingleColumn }), [isSingleColumn]);

	useEffect(() => {
		if(!isOpen) {
			resetNavState();
			setPicked([]);
		}
	}, [resetNavState, isOpen]);

	const handlePick = useCallback(newPicked => {
		if(deepEqual(picked, newPicked)) {
			setPicked([]);
		} else {
			setPicked([newPicked]);
		}
	}, [picked]);

	const handleMove = useCallback(async () => {
		if(picked.length > 0 && 'libraryKey' in picked[0]) {
			const pickedCollectionKey = picked[0].collectionKey || false;
			if(picked[0].libraryKey !== libraryKey) {
				//@TODO: Support for moving collections across libraries #227
				return;
			}

			setIsBusy(true);
			const patch = { parentCollection: pickedCollectionKey };
			await dispatch(updateCollection(collectionKey, patch, libraryKey));
			setIsBusy(false);
			dispatch(toggleModal(MOVE_COLLECTION, false));
		}
	}, [collectionKey, dispatch, libraryKey, picked]);


	const handleCancel = useCallback(() => dispatch(toggleModal(MOVE_COLLECTION, false)), [dispatch]);

	return (
		<Modal
			className="modal-touch collection-select-modal"
			contentLabel="Select Collection"
			isBusy={ isBusy }
			isOpen={ isOpen }
			onRequestClose={ handleCancel }
			overlayClassName="modal-centered modal-full-height modal-slide"
		>
			<div className="modal-body">
			{ isTouchOrSmall ? (
				<TouchHeader
					isModal={ true }
					className="darker"
					device={ device }
					path={ touchHeaderPath }
					onNavigate={ handleNavigation }
				/>
			) : (
			<React.Fragment>
					<div className="modal-header">
					<h4 className="modal-title truncate">
						Select target library or collection
					</h4>
					<Button
						icon
						className="close"
						onClick={ handleCancel }
					>
						<Icon type={ '16/close' } width="16" height="16" />
					</Button>
				</div>
				</React.Fragment>
			) }
				<Libraries
					pickerAllowRoot={ currentParentCollectionKey !== false }
					isPickerMode={ true }
					pickerPick={ handlePick }
					picked={ picked }
					pickerNavigate={ handleNavigation }
					pickerState= { navState }
					includeLibraries={ [libraryKey] } // TODO #227
					disabledCollections={ [collectionKey] }
					pickerSkipCollections={ [collectionKey, currentParentCollectionKey] }
				/>
			</div>
			{ isTouchOrSmall ? (
			<div className="modal-footer">
				<div className="modal-footer-left">
					<Button
						className="btn-link"
						onClick={ handleCancel }
					>
						Cancel
					</Button>
				</div>
				<div className="modal-footer-center">
					<h4 className="modal-title truncate">
						{
							picked.length === 0 ? 'Select a Collection' : 'Confirm Move?'
						}
					</h4>
				</div>
				<div className="modal-footer-right">
					<Button
						disabled={ picked.length === 0 }
						className="btn-link"
						onClick={ handleMove }
					>
						Move
					</Button>
				</div>
			</div>
			) : (
				<React.Fragment>
					<div className="modal-footer justify-content-end">
						<Button
							disabled={ picked.length === 0}
							className="btn-link"
							onClick={ handleMove }
						>
							Move
						</Button>
					</div>
				</React.Fragment>
			) }
		</Modal>
	);
}

export default memo(MoveCollectionsModal);

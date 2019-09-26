import PropTypes from 'prop-types';
import React, { useCallback, useRef, useState } from 'react';
import { Popover, PopoverHeader, PopoverBody } from 'reactstrap';
import { useDispatch, useSelector } from 'react-redux';

import Button from '../../ui/button';
import Icon from '../../ui/icon';
import Input from '../../form/input';
import withDevice from '../../../enhancers/with-device';
import { createItem, searchIdentifier, navigate, resetIdentifier } from '../../../actions';
import { getUniqueId } from '../../../utils';

const AddByIdentifier = props => {
	const { device, onAddByIdentifierModalOpen, onKeyDown } = props;
	const [isOpen, setIsOpen] = useState(false);
	const [isBusy, setIsBusy] = useState(false);
	const [identifier, setIdentifier] = useState('');
	const inputEl = useRef(null);
	const id = useRef(getUniqueId());
	const dispatch = useDispatch();
	const { collectionKey, itemsSource, libraryKey } = useSelector(state => state.current);

	const handleClick = useCallback(ev => {
		if(device.isTouchOrSmall) {
			onAddByIdentifierModalOpen(ev);
		} else {
			setIsOpen(!isOpen);
		}
	});

	const handleInputChange = useCallback(newIdentifier => {
		setIdentifier(newIdentifier);
	});

	const handleInputCommit = useCallback(newIdentifier => {
		addItem(newIdentifier);
	});

	const handleInputBlur = useCallback(() => true);

	const toggleOpen = useCallback(() => {
		dispatch(resetIdentifier());
		setIsOpen(!isOpen);
	});

	const addItem = useCallback(async itemIdentifier => {
		if(itemIdentifier) {
			setIsBusy(true);
			try {
				const reviewItem = await dispatch(searchIdentifier(itemIdentifier));
				if(itemsSource === 'collection' && collectionKey) {
					reviewItem.collections = [collectionKey];
				}
				const item = await dispatch(createItem(reviewItem, libraryKey));
				setIsBusy(false);
				setIsOpen(false);
				dispatch(resetIdentifier());
				dispatch(navigate({
					library: libraryKey,
					collection: collectionKey,
					items: [item.key],
					view: 'item-list'
				}, true));
			} catch(_) {
				setIsBusy(false);
				setIdentifier('');
				inputEl.current.focus();
				return;
			}
		}
	});

	return (
		<React.Fragment>
			<Button
				icon
				id={ id.current }
				onClick={ handleClick }
				onKeyDown={ onKeyDown }
				tabIndex={ -2 }
				title="Add By Identifier"
			>
				<Icon type="16/magic-wand" width="16" height="16" />
			</Button>
			<Popover
				className="popover-container"
				isOpen={ isOpen }
				placement="bottom"
				target={ id.current }
				toggle={ toggleOpen }
				trigger="legacy"
			>
				<PopoverHeader>
					<label htmlFor={ `${id.current}-input` }>
						Enter a URL, ISBN, DOI, PMID, or arXiv ID
					</label>
				</PopoverHeader>
				<PopoverBody>
					<div className="form">
						<Input
							autoFocus
							id={ `${id.current}-input` }
							isBusy={ isBusy }
							isDisabled={ isBusy }
							onBlur={ handleInputBlur }
							onChange={ handleInputChange }
							onCommit={ handleInputCommit }
							ref={ inputEl }
							tabIndex={ 0 }
							value={ identifier }
						/>
					</div>
				</PopoverBody>
			</Popover>
		</React.Fragment>
	);
}

AddByIdentifier.propTypes = {
	device: PropTypes.object,
	onAddByIdentifierModalOpen: PropTypes.func,
	onKeyDown: PropTypes.func,
}


export default withDevice(AddByIdentifier);

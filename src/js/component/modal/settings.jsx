import cx from 'classnames';
import { memo, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Icon } from 'web-common/components';

import Modal from '../ui/modal';
import { preferenceChange, toggleModal } from '../../actions';
import { SETTINGS } from '../../constants/modals';
import Select from '../form/select';
import { getUniqueId } from '../../utils';

const colorSchemeOptions = [
	{ label: 'Automatic', value: '' },
	{ label: 'Light', value: 'light' },
	{ label: 'Dark', value: 'dark' },
];

const densityOptions = [
	{ label: 'Automatic', value: '' },
	{ label: 'Mouse', value: 'mouse' },
	{ label: 'Touch', value: 'touch' },
];

const SettingsModal = () => {
	const dispatch = useDispatch();
	const isTouchOrSmall = useSelector(state => state.device.isTouchOrSmall);
	const colorScheme = useSelector(state => state.preferences.colorScheme ?? '');
	const density = useSelector(state => state.preferences.density ?? '');
	const useDarkModeForContent = useSelector(state => colorScheme !== 'light' && (state.preferences.useDarkModeForContent ?? true));
	const isSmall = useSelector(state => state.device.xxs || state.device.xs || state.device.sm);
	const isOpen = useSelector(state => state.modal.id === SETTINGS);
	const colorSchemeInputId = useRef(getUniqueId());
	const densityInputId = useRef(getUniqueId());
	const useDarkModeForContentInputId = useRef(getUniqueId());

	const handleChange = useCallback(() => true, []);

	const handleSelectColorScheme = useCallback((newColorScheme) => {
		dispatch(preferenceChange('colorScheme', newColorScheme));
	}, [dispatch]);

	const handleSelectDensity = useCallback((newDensity) => {
		dispatch(preferenceChange('density', newDensity));
	}, [dispatch]);

	const handleUseDarkModeForContentChange = useCallback((ev) => {
		dispatch(preferenceChange('useDarkModeForContent', ev.target.checked));
	}, [dispatch]);

	const handleClose = useCallback(
		() => dispatch(toggleModal(SETTINGS, false)),
	[dispatch]);

	return (
		<Modal
			className="modal-touch modal-settings"
			contentLabel="Settings"
			isOpen={isOpen}
			onRequestClose={handleClose}
			overlayClassName="modal-centered modal-slide"
		>
			<div className="modal-header">
				<div className="modal-header-left">
				</div>
				<div className="modal-header-center">
					<h4 className="modal-title truncate">
						Settings
					</h4>
				</div>
				<div className="modal-header-right">
					<Button
						icon
						className="close"
						onClick={handleClose}
						title="Close Dialog"
					>
						<Icon type={'16/close'} width="16" height="16" />
					</Button>
				</div>
			</div>
			<div className="modal-body">
				<div className="form">
					<div className={cx("form-group", { disabled: isSmall })}>
						<label
							id={`${densityInputId.current}-label`}
							className="col-form-label"
							htmlFor={isTouchOrSmall ? densityInputId.current : null}
						>
							UI Density
						</label>
						<div className="col">
							<Select
								isDisabled={isSmall}
								aria-labelledby={isTouchOrSmall ? null : `${densityInputId.current}-label` }
								id={densityInputId.current}
								className="form-control form-control-sm"
								onChange={handleChange}
								onCommit={handleSelectDensity}
								options={densityOptions}
								value={isSmall ? 'touch' : density}
								searchable={false}
							/>
						</div>
					</div>
					<div className="form-group">
						<label
							id={`${colorSchemeInputId.current}-label`}
							className="col-form-label"
							htmlFor={isTouchOrSmall ? colorSchemeInputId.current : null}
						>
							Color Scheme
						</label>
						<div className="col">
							<Select
								aria-labelledby={isTouchOrSmall ? null : `${colorSchemeInputId.current}-label`}
								id={colorSchemeInputId.current}
								className="form-control form-control-sm"
								onChange={handleChange}
								onCommit={handleSelectColorScheme}
								options={colorSchemeOptions}
								value={colorScheme}
								searchable={false}
							/>
						</div>
					</div>
					<div className={cx("form-group checkbox", { disabled: colorScheme === 'light' })}>
						<input
							checked={colorScheme !== 'light' && useDarkModeForContent}
							className="col-form-label"
							disabled={colorScheme === 'light'}
							id={useDarkModeForContentInputId.current}
							onChange={handleUseDarkModeForContentChange}
							type="checkbox"
						/>
						<label htmlFor={useDarkModeForContentInputId.current}>
							Use Dark Mode for Content
						</label>
					</div>
				</div>
			</div>
		</Modal>
    );
}

export default memo(SettingsModal);

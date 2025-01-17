import AutoSizer from 'react-virtualized-auto-sizer';
import cx from 'classnames';
import InfiniteLoader from "react-window-infinite-loader";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { NativeTypes } from 'react-dnd-html5-backend';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { useDrop } from 'react-dnd';
import { useThrottledCallback } from 'use-debounce';
import { useFocusManager, usePrevious } from 'web-common/hooks';
import { isTriggerEvent } from 'web-common/utils';
import { Spinner } from 'web-common/components';
import PropTypes from 'prop-types';

import columnProperties from '../../../constants/column-properties';
import HeaderRow from './table-header-row';
import TableBody from './table-body';
import TableRow from './table-row';
import { get, applyChangesToVisibleColumns, getRequestTypeFromItemsSource, resizeVisibleColumns } from '../../../utils';
import { ATTACHMENT } from '../../../constants/dnd';
import { abortAllRequests, currentTrashOrDelete, createAttachmentsFromDropped, connectionIssues, fetchSource,
navigate, selectItemsKeyboard, selectFirstItem, selectLastItem, preferenceChange, triggerFocus,
	triggerHighlightedCollections, currentRemoveColoredTags, currentToggleTagByIndex } from '../../../actions';
import { useSourceData } from '../../../hooks';
import { isDelKeyDown, isHighlightKeyDown } from '../../../common/event';
import ScrollEffectComponent from './scroll-effect';
import { ROW_HEIGHT, SCROLL_BUFFER } from '../../../constants/constants';


const getColumnCssVars = (columns, width, scrollbarWidth) =>
	Object.fromEntries(columns.map((c, i) => [
		`--col-${i}-width`,
		i === columns.length - 1 ? `${c.fraction * width - scrollbarWidth}px` : `${c.fraction * width}px`
	]));

// @NOTE: TableFocus and TableScroll are two effect-only components that have been extracted from Table
// 		  to avoid re-rendering the entire Table whenever selectedItemKeys/isItemsTableFocused changes.
const TableFocus = memo(({ tableRef, focusBySelector, resetLastFocused }) => {
	const dispatch = useDispatch();
	const selectedItemKeysLength = useSelector(state => state.current.itemKeys.length);
	const isItemsTableFocused = useSelector(state => state.current.isItemsTableFocused);
	const wasItemsTableFocused = usePrevious(isItemsTableFocused);

	useEffect(() => {
		if(!wasItemsTableFocused && isItemsTableFocused && selectedItemKeysLength === 0) {
			(async () => {
				const index = await dispatch(selectFirstItem(true));
				if (index !== null && tableRef.current) {
					focusBySelector('[data-index="0"]');
				}
			})();
		}
		if(wasItemsTableFocused && !isItemsTableFocused) {
			resetLastFocused();
		}
	}, [dispatch, focusBySelector, isItemsTableFocused, selectedItemKeysLength, resetLastFocused, wasItemsTableFocused, tableRef]);

	return null;
});

TableFocus.propTypes = {
	tableRef: PropTypes.shape({ current: PropTypes.instanceOf(Element) }).isRequired,
	focusBySelector: PropTypes.func.isRequired,
	resetLastFocused: PropTypes.func.isRequired,
};

TableFocus.displayName = "TableFocus";


// TODO: This should be a wrapper around common/table.jsx
const Table = () => {
	const containerDom = useRef(null);
	const headerRef = useRef(null);
	const tableRef = useRef(null);
	const listRef = useRef(null);
	const innerRef = useRef(null);
	const outerRef = useRef(null);
	const loader = useRef(null);
	const resizing = useRef(null);
	const reordering = useRef(null);
	const mouseUpTimeout = useRef(null);
	const lastRequest = useRef({});
	const [isResizing, setIsResizing] = useState(false);
	const [isReordering, setIsReordering] = useState(false);
	const [reorderTarget, setReorderTarget] = useState(null);
	const [isHoveringBetweenRows, setIsHoveringBetweenRows] = useState(false);
	const { injectPoints, isFetching, keys, hasChecked, totalResults, sortBy, sortDirection, requests } = useSourceData();
	const prevSortBy = usePrevious(sortBy);
	const prevSortDirection = usePrevious(sortDirection);
	const isAdvancedSearch = useSelector(state => state.current.isAdvancedSearch);
	const collectionKey = useSelector(state => state.current.collectionKey);
	const libraryKey = useSelector(state => state.current.libraryKey);
	const itemsSource = useSelector(state => state.current.itemsSource);
	const requestType = getRequestTypeFromItemsSource(itemsSource);
	const errorCount = useSelector(state => get(state, ['traffic', requestType, 'errorCount'], 0));
	const isEmbedded = useSelector(state => state.config.isEmbedded);
	const prevErrorCount = usePrevious(errorCount);
	const isFileUploadAllowedInLibrary = useSelector(
		state => (state.config.libraries.find(
			l => l.key === state.current.libraryKey
		) || {}).isFileUploadAllowed
	);
	const isFileUploadAllowed = isFileUploadAllowedInLibrary && !['trash', 'publications'].includes(itemsSource);
	const [scrollToRow, setScrollToRow] = useState(null);
	const columnsData = useSelector(state => state.preferences.columns, shallowEqual);
	const isMyLibrary = useSelector(state =>
		(state.config.libraries.find(l => l.key === state.current.libraryKey) || {}).isMyLibrary
	);
	const scrollbarWidth = useSelector(state => state.device.scrollbarWidth);
	const isModalOpen = useSelector(state => state.modal.id);

	const columns = useMemo(() => {
		const columns = columnsData
		.filter(c => c.isVisible)
		.filter(c => !isMyLibrary || (isMyLibrary && !(c.field in columnProperties && columnProperties[c.field].excludeInMyLibrary)));

		var sumOfFractions = columns.reduce((aggr, c) => aggr + c.fraction, 0);
		if(sumOfFractions != 1) {
			let difference = sumOfFractions - 1; // overflow if positive, underflow if negative
			let adjustEachBy = difference / columns.length;
			let counter = 1;
			do {
				for(var i = 0; i < columns.length; i++) {
					const available = columns[i].fraction - columns[i].minFraction;
					// avoid dealing with very small numbers
					if((Math.abs(difference) < 0.001 || counter > 10) && available > difference) {
						columns[i].fraction -= difference;
						difference = 0;
						break;
					}
					const reduceThisBy = Math.min(available, adjustEachBy);
					difference -= reduceThisBy;
					columns[i].fraction -= reduceThisBy;
				}
				adjustEachBy = difference / columns.length;
			} while(difference !== 0);
		}
		return columns;
	}, [columnsData, isMyLibrary]);

	const { receiveFocus, receiveBlur, focusBySelector, resetLastFocused } = useFocusManager(
		tableRef, { initialQuerySelector: ['[aria-selected="true"]', '[data-index="0"]'] }
	);

	const dispatch = useDispatch();

	const [{ isOver, canDrop }, drop] = useDrop({
		accept: [ATTACHMENT, NativeTypes.FILE],
		canDrop: () => isFileUploadAllowed,
		collect: monitor => ({
			isOver: monitor.isOver({ shallow: true }),
			canDrop: monitor.canDrop(),
		}),
		drop: (props, monitor) => {
			if(monitor.isOver({ shallow: true })) { //ignore if dropped on a row (which is handled there)
				const itemType = monitor.getItemType();
				const item = monitor.getItem();

				if(itemType === ATTACHMENT) {
					return { collection: collectionKey, library: libraryKey };
				}

				if(itemType === NativeTypes.FILE) {
					dispatch(createAttachmentsFromDropped(item.files, { collection: collectionKey }));
					return;
				}
			}
		}
	});

	const handleIsItemLoaded = useCallback(index => {
		if(keys && !!keys[index]) {
			return true; // loaded
		}
		return requests.some(r => index >= r[0] && index < r[1]); // loading
	}, [keys, requests]);

	const handleLoadMore = useCallback((startIndex, stopIndex) => {
		let offset = 0;
		for(let i = 0; i <= injectPoints.length; i++) {
			if(injectPoints[i] <= startIndex) {
				offset++;
			}
		}
		dispatch(fetchSource(Math.max(startIndex - offset, 0), stopIndex))
		lastRequest.current = { startIndex, stopIndex };
	}, [dispatch, injectPoints]);

	const handleResize = useCallback(ev => {
		const columnDom = ev.target.closest(['[data-colindex]']);
		const index = columnDom.dataset.colindex - 1;
		const { width } = containerDom.current.getBoundingClientRect();
		setIsResizing(true);
		resizing.current = { origin: ev.clientX, index, width };
	}, []);

	const handleReorder = useCallback(ev => {
		const columnDom = ev.target.closest(['[data-colindex]']);
		const index = parseInt(columnDom.dataset.colindex, 10);
		const { left, width } = containerDom.current.getBoundingClientRect();
		setIsReordering(true);
		reordering.current = { index, left, width };
	}, []);

	// throttle resizing to 100Hz (or current framerate) for smoother experience
	const handleMouseMove = useThrottledCallback(useCallback(ev => {
		if(resizing.current !== null) {
			const { origin, index, width } = resizing.current;
			const offsetPixels = ev.clientX - origin;
			const offset = offsetPixels / width;
			const newColumns = columns.map(c => ({ ...c }));
			newColumns[index].fraction = Math.max(
				columns[index].fraction + offset,
				columns[index].minFraction
			);
			resizeVisibleColumns(newColumns, -offset, true);

			resizing.current.newColumns = newColumns;
			const style = getColumnCssVars(newColumns, width, scrollbarWidth);
			Object.entries(style).forEach(([name, value]) =>
				tableRef.current.style.setProperty(name, value)
			);
		} else if(reordering.current !== null) {
			const { index, left, width } = reordering.current;
			var prevColumnEdge = left, columnEdge = left;
			var columnWidth;
			var targetIndex;

			if(ev.clientX < left) {
				targetIndex = 0;
			} else {

				for (let i = 0; i < columns.length; i++) {
					columnWidth = columns[i].fraction * width;
					prevColumnEdge = columnEdge;
					columnEdge += columnWidth;
					const testOffest = columnEdge;
					if(ev.clientX < testOffest) {
						targetIndex = i;
						break;
					}
				}
			}
			const isMovingRight = targetIndex > index;
			const isMovingLeft = targetIndex < index;

			if(isMovingRight && ev.clientX < prevColumnEdge + 0.5 * columnWidth) {
				targetIndex--;
			}
			if(isMovingLeft && ev.clientX > columnEdge - 0.5 * columnWidth) {
				targetIndex++;
			}

			if(targetIndex === index) {
				setReorderTarget(null);
				reordering.current.targetIndex = null;
			} else {
				reordering.current.targetIndex = targetIndex;
				setReorderTarget({ index: targetIndex , isMovingRight, isMovingLeft });
			}
		}
	}, [columns, scrollbarWidth]), 10, { leading: true });

	const handleMouseUp = useCallback(ev => {
		if(resizing.current !== null && resizing.current.newColumns) {
			ev.preventDefault();
			const newColumns = columnsData.map(c => ({ ...c }));
			dispatch(preferenceChange('columns', applyChangesToVisibleColumns(resizing.current.newColumns, newColumns)));
		} else if(reordering.current !== null && reordering.current && typeof(reordering.current.targetIndex) === 'number' && typeof(reordering.current.index) === 'number') {
			const fieldFrom = columns[reordering.current.index].field;
			const fieldTo = columns[reordering.current.targetIndex].field;
			const indexFrom = columnsData.findIndex(c => c.field === fieldFrom);
			const indexTo = columnsData.findIndex(c => c.field === fieldTo);

			if(indexFrom > -1 && indexTo > -1) {
				const newColumns = columnsData.map(c => ({ ...c }));
				newColumns.splice(indexTo, 0, newColumns.splice(indexFrom, 1)[0]);
				dispatch(preferenceChange('columns', newColumns));
			}
		}

		resizing.current = null;
		reordering.current = null;

		mouseUpTimeout.current = setTimeout(() => { setIsResizing(false); setIsReordering(false); setReorderTarget(null) });
	}, [columns, columnsData, dispatch]);

	const handleMouseLeave = useCallback(() => {
		setIsReordering(false);
		setIsResizing(false);
		setReorderTarget(null);
		resizing.current = null;
		reordering.current = null;
	}, []);

	const handleFileHoverOnRow = useCallback((isOverRow, dropZone) => {
		setIsHoveringBetweenRows(isOverRow && dropZone !== null);
	}, []);

	const handleKeyUp = useCallback(ev => {
		if(!isHighlightKeyDown(ev)) {
			dispatch(triggerHighlightedCollections(false));
		}
	}, [dispatch]);

	const handleKeyDown = useCallback(async ev => {
		var direction, magnitude = 1;
		if(isEmbedded && isTriggerEvent(ev)) {
			dispatch(navigate({ view: 'item-details '}));
			return;
		} else if(ev.key === 'ArrowUp') {
			direction = -1;
		} else if(ev.key === 'ArrowDown') {
			direction = 1;
		} else if(isDelKeyDown(ev)) {
			dispatch(currentTrashOrDelete());
			dispatch(navigate({ items: [], noteKey: null, attachmentKey: null }));
			return;
		} else if(ev.key === 'Home') {
			dispatch(selectFirstItem());
		} else if(ev.key === 'End') {
			dispatch(selectLastItem());
		} else if(ev.key === 'PageUp' && outerRef.current) {
			direction = -1;
			magnitude = Math.floor(outerRef.current.getBoundingClientRect().height / ROW_HEIGHT)
			ev.preventDefault();
		} else if(ev.key === 'PageDown' && outerRef.current) {
			direction = 1;
			magnitude = Math.floor(outerRef.current.getBoundingClientRect().height / ROW_HEIGHT);
			ev.preventDefault();
		} else if(Array.from({ length: 9 }, (_, i) => (i + 1).toString()).includes(ev.key)) {
			dispatch(currentToggleTagByIndex(parseInt(ev.key) - 1));
			return;
		} else if(ev.key === '0') {
			dispatch(currentRemoveColoredTags());
			return;
		} else if(isHighlightKeyDown(ev)) {
			dispatch(triggerHighlightedCollections(true));
			return;
		}

		if(!direction) {
			return;
		}

		ev.preventDefault();

		const cursorIndex = await dispatch(selectItemsKeyboard(direction, magnitude, ev.getModifierState('Shift')));

		if (cursorIndex === -1 && document.activeElement?.closest('.items-table-head') !== headerRef.current) {
			focusBySelector('.items-table-head');
		} else {
			focusBySelector(`[data-index="${cursorIndex}"]`);
		}
	}, [dispatch, isEmbedded, focusBySelector]);

	const handleTableFocus = useCallback(ev => {
		// The overflow list is made focusable by default in most browsers and to prevent this we
		// need to set `tabIndex` to -1. However, since this element is rendered by react-window, we
		// cannot pass it as a prop. As a workaround, we set the tabIndex attribute directly here.
		// This fixes issue #519.
		outerRef.current?.setAttribute?.('tabindex', '-1');
		const hasChangedFocused = receiveFocus(ev);
		if(hasChangedFocused) {
			dispatch(triggerFocus('items-table', true));
		}
	}, [dispatch, receiveFocus]);

	const handleTableBlur = useCallback(ev => {
		const hasChangedFocused = receiveBlur(ev);
		if(hasChangedFocused) {
			dispatch(triggerFocus('items-table', false));
		}
	}, [dispatch, receiveBlur]);

	useEffect(() => {
		if(scrollToRow !== null && !hasChecked && !isFetching) {
			let startIndex = Math.max(scrollToRow - 20, 0);
			let stopIndex = scrollToRow + 50;
			dispatch(fetchSource(startIndex, stopIndex));
			lastRequest.current = { startIndex, stopIndex };
		}
	}, [dispatch, isFetching, hasChecked, scrollToRow]);

	useEffect(() => {
		return () => {
			if(mouseUpTimeout.current) {
				clearTimeout(mouseUpTimeout.current);
			}
			dispatch(triggerFocus('items-table', false));
		}
	}, [dispatch]);

	useEffect(() => {
		if((typeof prevSortBy === 'undefined' && typeof prevSortDirection === 'undefined') || (prevSortBy === sortBy && prevSortDirection === sortDirection)) {
			return;
		}

		if(loader.current) {
			// this will trigger `loadMoreItems` which in turn will call `handleLoadMore`
			loader.current.resetloadMoreItemsCache(true);
		}

		// if we were fetching when sort changed, we need to abort the current request and re-fetch
		if(isFetching) {
			dispatch(abortAllRequests(requestType));
			setTimeout(() => {
				const { startIndex, stopIndex } = lastRequest.current;
				if(typeof(startIndex) === 'number' && typeof(stopIndex) === 'number') {
					dispatch(fetchSource(startIndex, stopIndex));
				}
			}, 0)
		}
	}, [dispatch, isFetching, prevSortBy, prevSortDirection, requestType, sortBy, sortDirection, totalResults]);

	useEffect(() => {
		document.addEventListener('mouseup', handleMouseUp);
		return () => {
			document.removeEventListener('mouseup', handleMouseUp)
		}
	}, [handleMouseUp]);

	useEffect(() => {
		document.addEventListener('mousemove', handleMouseMove);
		return () => {
			document.removeEventListener('mousemove', handleMouseMove)
		}
	}, [handleMouseMove]);

	useEffect(() => {
		document.addEventListener('mouseleave', handleMouseLeave);
		return () => {
			document.removeEventListener('mouseleave', handleMouseLeave)
		}
	}, [handleMouseLeave]);

	useEffect(() => {
		document.addEventListener('keyup', handleKeyUp);
		return () => {
			document.removeEventListener('keyup', handleKeyUp)
		}
	}, [handleKeyUp]);

	useEffect(() => {
		if(errorCount > 0 && errorCount > prevErrorCount) {
			const { startIndex, stopIndex } = lastRequest.current;
			if(typeof(startIndex) === 'number' && typeof(stopIndex) === 'number') {
				dispatch(fetchSource(startIndex, stopIndex));
			}
		}
		if(errorCount > 3 && prevErrorCount === 3) {
			dispatch(connectionIssues());
		} else if(errorCount === 0 && prevErrorCount > 0) {
			dispatch(connectionIssues(true));
		}
	}, [dispatch, errorCount, prevErrorCount]);

	const rowData = useMemo(() => ({ onFileHoverOnRow: handleFileHoverOnRow, columns }), [columns, handleFileHoverOnRow]);

	return drop(
		<div
			ref={ containerDom }
			className={cx('items-table-wrap', {
				resizing: isResizing,
				reordering: isReordering,
				'dnd-target': (isOver && canDrop) || isHoveringBetweenRows
			}) }
		>
			<TableFocus
				tableRef={ tableRef }
				focusBySelector={ focusBySelector }
				resetLastFocused={ resetLastFocused }
			/>
			<ScrollEffectComponent listRef={ listRef } setScrollToRow={setScrollToRow} />
			{ hasChecked && (
				<AutoSizer>
				{({ height, width }) => (
					<InfiniteLoader
						isItemLoaded={ handleIsItemLoaded }
						itemCount={ hasChecked ? totalResults : 0 }
						loadMoreItems={ handleLoadMore }
						ref={ loader }
					>
						{({ onItemsRendered, ref }) => (
							<div
								tabIndex={ 0 }
								onFocus={ handleTableFocus }
								onBlur={ handleTableBlur }
								onKeyDown={ handleKeyDown }
								ref={ tableRef }
								className="items-table striped"
								style={ getColumnCssVars(columns, width, scrollbarWidth) }
								role="grid"
								aria-multiselectable="true"
								aria-readonly="true"
								aria-label="items"
								data-width={ width }
								aria-rowcount={ totalResults }
							>
								<HeaderRow
									ref={ headerRef }
									columns={ columns }
									width={ width }
									onResize={ handleResize }
									onReorder={ handleReorder }
									isResizing={ isResizing }
									isReordering={ isReordering }
									reorderTarget= { reorderTarget }
								/>
								<List
									initialScrollOffset={Math.max(scrollToRow - SCROLL_BUFFER, 0) * ROW_HEIGHT}
									outerElementType={ TableBody }
									className="items-table-body"
									height={ height - ROW_HEIGHT } // add margin for HeaderRow
									itemCount={ hasChecked ? totalResults : 0 }
									itemData={ rowData }
									itemSize={ ROW_HEIGHT }
									onItemsRendered={ onItemsRendered }
									ref={ r => { ref(r); listRef.current = r } }
									outerRef={ outerRef }
									innerRef={ innerRef }
									width={ width - 16 }
								>
									{ TableRow }
								</List>
							</div>
						)}
					</InfiniteLoader>
				)}
				</AutoSizer>
			) }
			{ !hasChecked && !isModalOpen && <Spinner className="large" /> }
			{ isAdvancedSearch && (
				<div className="table-cover">
					Advanced search mode — press Enter to search.
				</div>
			) }
		</div>
	);
};

export default memo(Table);

import React from 'react';
import {
  Box,
  Flex,
  Text,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { IconType } from 'react-icons';
import { motion } from 'framer-motion';

// Create a component type that can be used with Chakra UI's Icon
import * as ReactIcons from 'react-icons/fi'; // Import all icons from react-icons/fi

const MotionBox = motion(Box);

interface MetricCardProps {
  title: string;
  value: string;
  delta?: string;
  description?: string;
  icon?: React.ElementType; // Changed from IconType to React.ElementType
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  delta,
  description,
  icon,
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  const iconBgColor = useColorModeValue('blue.50', 'blue.900');
  const iconColor = useColorModeValue('blue.500', 'blue.300');
  const deltaColor = useColorModeValue('green.500', 'green.300');
  const descriptionColor = useColorModeValue('gray.600', 'gray.400');

  // Determine if delta is positive or negative (visually)
  const isPositive = delta && !delta.startsWith('-');

  return (
    <MotionBox
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      flex="1"
    >
      <Box
        p={4}
        borderRadius="lg"
        bg={bgColor}
        border="1px"
        borderColor={borderColor}
        boxShadow="sm"
        height="100%"
      >
        <Flex mb={2} alignItems="center">
          {icon && (
            <Box
              p={2}
              borderRadius="md"
              bg={iconBgColor}
              color={iconColor}
              mr={3}
            >
              <Icon as={icon} boxSize={4} />
            </Box>
          )}
          <Text fontSize="sm" fontWeight="medium" color={textColor}>
            {title}
          </Text>
        </Flex>
        
        <Stat>
          <StatNumber fontSize="2xl" fontWeight="bold" color={textColor}>
            {value}
          </StatNumber>
          
          {delta && (
            <StatHelpText 
              fontSize="sm" 
              color={isPositive ? deltaColor : 'red.500'}
              mb={0}
            >
              {delta}
            </StatHelpText>
          )}
          
          {description && (
            <Text fontSize="xs" color={descriptionColor} mt={1}>
              {description}
            </Text>
          )}
        </Stat>
      </Box>
    </MotionBox>
  );
};

export default MetricCard;